import type {
  ElementBox,
  IdGenerator,
  LayoutPDFTemplate,
  TemplateElement,
  TemplatePage,
} from '@/engine/core/document.js';
import {
  remapFormulaOutputReferences,
  remapGridIdentities,
  remapTableIdentities,
} from '@/engine/core/cloneTemplateFile.js';
import { remapElementOutputReferences } from '@/engine/core/elementOutputReferences.js';
import { createFormulaOutputReference, getFormulaReferences } from '@/utils/calc.js';
import {
  expandElementIdsToGroups,
  normalizeElementGroups,
  remapElementGroupIds,
} from '@/engine/core/elementGroups.js';
import { removeSummaryReferences } from '@/engine/core/summaryReferences.js';
import {
  remapTablePaginationElementReferences,
  removeTablePaginationElementReferences,
} from '@/engine/core/tablePaginationReferences.js';

export interface DuplicateElementsOptions {
  /** Explicit boxes keyed by source element id. */
  boxes?: ReadonlyMap<string, ElementBox>;
  /** Offset applied to copied boxes when no explicit box is provided. Defaults to `{ x: 5, y: 5 }`. */
  offset?: { x: number; y: number };
  /** Expand the input ids to every member of the same group. Defaults to `false`. */
  expandGroups?: boolean;
}

/**
 * Deep-copy elements within a page, assigning fresh ids and remapping every
 * template-owned identity (table columns/rows/footers, grid axes, groups,
 * pagination references and summary output references).
 *
 * Locked elements are skipped. The source page is not mutated.
 */
export function duplicateElementsInPage(
  page: TemplatePage,
  ids: ReadonlySet<string>,
  idGenerator: IdGenerator,
  options: DuplicateElementsOptions = {},
): TemplateElement<object>[] {
  const requested = options.expandGroups
    ? new Set(expandElementIdsToGroups(page, [...ids]))
    : ids;
  const sources = page.elements.filter(element => requested.has(element.id) && !element.locked);
  if (sources.length === 0) return [];

  const elementIds = new Map(sources.map(element => [element.id, idGenerator('el')]));
  const outputIdsBySource = new Map<string, ReadonlyMap<string, string>>();
  const offset = options.offset ?? { x: 5, y: 5 };
  const additions = sources.map(element => {
    const duplicate = structuredClone(element);
    duplicate.id = elementIds.get(element.id)!;
    duplicate.name = `${element.name} copy`;
    const explicitBox = options.boxes?.get(element.id);
    duplicate.box = explicitBox
      ? { ...explicitBox }
      : { ...element.box, x: element.box.x + offset.x, y: element.box.y + offset.y };
    delete duplicate.presetId;
    if (duplicate.binding) {
      duplicate.binding = { ...duplicate.binding, key: `field_${duplicate.id}` };
    }
    const outputIds = remapTableIdentities(duplicate, idGenerator);
    if (outputIds.size > 0) outputIdsBySource.set(element.id, outputIds);
    remapGridIdentities(duplicate, idGenerator);
    return duplicate;
  });
  remapElementGroupIds(additions, idGenerator);
  remapTablePaginationElementReferences(additions, elementIds, { dropUnmapped: true });
  remapElementOutputReferences(additions, { elementIds, outputIdsBySource });
  const formulaOutputReferences = new Map<string, string>();
  for (const [oldElementId, outputIds] of outputIdsBySource) {
    const nextElementId = elementIds.get(oldElementId);
    if (!nextElementId) continue;
    for (const [oldOutputId, nextOutputId] of outputIds) {
      formulaOutputReferences.set(
        createFormulaOutputReference(oldElementId, oldOutputId),
        createFormulaOutputReference(nextElementId, nextOutputId),
      );
    }
  }
  remapFormulaOutputReferences(additions, formulaOutputReferences);
  return additions;
}

export interface DanglingOutputReference {
  elementId: string;
  reference: string;
}

export interface RemoveElementsOptions {
  /** Expand the input ids to every member of the same group. Defaults to `false`. */
  expandGroups?: boolean;
  /** Also delete locked elements. Defaults to `false`. */
  includeLocked?: boolean;
  /**
   * Called for each formula reference that still points at an output owned by a
   * deleted element. The reference is left in place so the edit can be undone;
   * hosts can surface the report immediately instead of waiting for render.
   */
  onDanglingOutputReference?: (reference: DanglingOutputReference) => void;
}

function tableOutputReferences(element: TemplateElement<object>): string[] {
  if (element.type !== 'table') return [];
  const props = element.props as { footers?: Array<{ id?: unknown }> };
  const footers = Array.isArray(props.footers) ? props.footers : [];
  return footers.flatMap(footer =>
    typeof footer?.id === 'string'
      ? [createFormulaOutputReference(element.id, footer.id)]
      : []
  );
}

function elementFormulas(element: TemplateElement<object>): string[] {
  if (element.type === 'calc' && typeof element.value === 'string') {
    return [element.value];
  }
  if (element.type !== 'table') return [];
  const props = element.props as {
    columns?: Array<{ formula?: { expression?: unknown } }>;
    footers?: Array<{ formula?: { expression?: unknown } }>;
  };
  const entries = [
    ...(Array.isArray(props.columns) ? props.columns : []),
    ...(Array.isArray(props.footers) ? props.footers : []),
  ];
  return entries.flatMap(entry =>
    typeof entry?.formula?.expression === 'string' ? [entry.formula.expression] : []
  );
}

/**
 * Delete elements from a template and repair references owned by the
 * remaining elements (summary items and table pagination lists).
 *
 * Returns the ids that were actually removed.
 */
export function removeElementsFromTemplate(
  template: LayoutPDFTemplate,
  ids: readonly string[],
  options: RemoveElementsOptions = {},
): string[] {
  const requested = new Set(ids);
  if (requested.size === 0) return [];
  const removed: string[] = [];
  for (const page of template.pages) {
    const targets = options.expandGroups
      ? new Set(expandElementIdsToGroups(page, [...requested]))
      : requested;
    const removedSourceIds = new Set(
      page.elements
        .filter(element =>
          targets.has(element.id) && (options.includeLocked || !element.locked)
        )
        .map(element => element.id),
    );
    if (removedSourceIds.size === 0) continue;
    const removedElements = page.elements.filter(element => removedSourceIds.has(element.id));
    const removedOutputReferences = new Set(removedElements.flatMap(tableOutputReferences));
    removeSummaryReferences(page, elementId => removedSourceIds.has(elementId));
    removeTablePaginationElementReferences(page, elementId => removedSourceIds.has(elementId));
    page.elements = page.elements.filter(element => !removedSourceIds.has(element.id));
    if (options.onDanglingOutputReference && removedOutputReferences.size > 0) {
      for (const element of page.elements) {
        const reported = new Set<string>();
        for (const expression of elementFormulas(element)) {
          let references: string[];
          try {
            references = getFormulaReferences(expression);
          } catch {
            continue;
          }
          for (const reference of references) {
            if (!removedOutputReferences.has(reference) || reported.has(reference)) continue;
            reported.add(reference);
            options.onDanglingOutputReference({ elementId: element.id, reference });
          }
        }
      }
    }
    normalizeElementGroups(page);
    removed.push(...removedSourceIds);
  }
  return removed;
}

/**
 * Drop summary items that point at table footers which no longer exist.
 * Called after table props/footers are edited.
 */
export function reconcileTableOutputReferences(
  template: LayoutPDFTemplate,
  changedIds: ReadonlySet<string>,
): void {
  for (const page of template.pages) {
    for (const candidate of page.elements) {
      if (!changedIds.has(candidate.id) || candidate.type !== 'table') continue;
      const props = candidate.props as { footers?: Array<{ id: string }> };
      const footerIds = new Set((props.footers ?? []).map(footer => footer.id));
      removeSummaryReferences(
        page,
        (sourceElementId, outputId) =>
          sourceElementId === candidate.id && !footerIds.has(outputId),
      );
    }
  }
}
