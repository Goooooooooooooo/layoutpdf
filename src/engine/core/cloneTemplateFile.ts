import {
  createId,
  type IdGenerator,
  type JsonValue,
  type TemplateElement,
  type TemplateFile,
} from '@/engine/core/document.js';
import { assertValidTemplateFile } from '@/engine/core/validation.js';
import { LayoutPDFRuntimeError } from '@/engine/utils/errors.js';
import { remapElementOutputReferences } from '@/engine/core/elementOutputReferences.js';
import { remapElementGroupIds } from '@/engine/core/elementGroups.js';
import { remapTablePaginationElementReferences } from '@/engine/core/tablePaginationReferences.js';
import { createFormulaOutputReference, renameFormulaReferences } from '@/utils/calc.js';

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function remapTableIdentities(
  element: TemplateElement<object>,
  idGenerator: IdGenerator,
): Map<string, string> {
  if (element.type !== 'table') return new Map();
  if (Array.isArray(element.value)) {
    element.value = element.value.map(row => {
      if (!isRecord(row)) return row;
      return { ...row, id: idGenerator('el') };
    });
  }

  const props = element.props as Record<string, unknown>;
  if (Array.isArray(props.columns)) {
    props.columns = props.columns.map(column => {
      if (!column || typeof column !== 'object' || Array.isArray(column)) return column;
      return { ...column, id: idGenerator('el') };
    });
  }

  const footerIds = new Map<string, string>();
  if (Array.isArray(props.footers)) {
    props.footers = props.footers.map(footer => {
      if (!footer || typeof footer !== 'object' || Array.isArray(footer)) return footer;
      const current = footer as Record<string, unknown>;
      const oldId = typeof current.id === 'string' ? current.id : '';
      const id = idGenerator('el');
      if (oldId) footerIds.set(oldId, id);
      return { ...current, id };
    }).map(footer => {
      if (!footer || typeof footer !== 'object' || Array.isArray(footer)) return footer;
      const current = footer as Record<string, unknown>;
      const formula = current.formula;
      if (!formula || typeof formula !== 'object' || Array.isArray(formula)) return current;
      const nextFormula = { ...formula } as Record<string, unknown>;
      if (typeof nextFormula.expression === 'string') {
        nextFormula.expression = renameFormulaReferences(
          nextFormula.expression,
          new Map(
            [...footerIds].map(([previousId, nextId]) => [
              `footer.${previousId}`,
              `footer.${nextId}`,
            ]),
          ),
        );
      }
      return { ...current, formula: nextFormula };
    });
  }

  const footerBand = props.footerBand;
  if (!footerBand || typeof footerBand !== 'object' || Array.isArray(footerBand)) return footerIds;
  const currentBand = footerBand as Record<string, unknown>;
  if (!Array.isArray(currentBand.items)) return footerIds;
  props.footerBand = {
    ...currentBand,
    items: currentBand.items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const currentItem = item as Record<string, unknown>;
      return {
        ...currentItem,
        footerId: typeof currentItem.footerId === 'string'
          ? footerIds.get(currentItem.footerId) ?? currentItem.footerId
          : currentItem.footerId,
      };
    }),
  };
  return footerIds;
}

export function remapGridIdentities(element: TemplateElement<object>, idGenerator: IdGenerator): void {
  if (element.type !== 'grid') return;
  const props = element.props as Record<string, unknown>;
  if (Array.isArray(props.columns)) {
    props.columns = props.columns.map(column => {
      if (!column || typeof column !== 'object' || Array.isArray(column)) return column;
      return { ...column, id: idGenerator('el') };
    });
  }
  if (Array.isArray(props.rows)) {
    props.rows = props.rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      return { ...row, id: idGenerator('el') };
    });
  }
}

function remapImageAsset(element: TemplateElement<object>, assetIds: Map<string, string>): void {
  if (element.type !== 'image' || !isRecord(element.value)) return;
  if (element.value.source !== 'asset' || typeof element.value.assetId !== 'string') return;
  element.value = {
    ...element.value,
    assetId: assetIds.get(element.value.assetId) ?? element.value.assetId,
  };
}

export function remapFormulaOutputReferences(
  elements: TemplateElement<object>[],
  replacements: ReadonlyMap<string, string>,
): void {
  for (const element of elements) {
    if (element.type === 'calc' && typeof element.value === 'string') {
      element.value = renameFormulaReferences(element.value, replacements);
    }
    if (element.type !== 'table') continue;
    const props = element.props as Record<string, unknown>;
    for (const key of ['columns', 'footers'] as const) {
      const entries = props[key];
      if (!Array.isArray(entries)) continue;
      props[key] = entries.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const current = entry as Record<string, unknown>;
        const formula = current.formula;
        if (!formula || typeof formula !== 'object' || Array.isArray(formula)) return current;
        const expression = (formula as Record<string, unknown>).expression;
        if (typeof expression !== 'string') return current;
        return {
          ...current,
          formula: {
            ...formula,
            expression: renameFormulaReferences(expression, replacements),
          },
        };
      });
    }
  }
}

export function cloneTemplateFileWithNewIds(
  source: TemplateFile,
  newTemplateId: string,
  idGenerator: IdGenerator = createId,
  options: { dropUnmappedOutputReferences?: boolean } = {},
): TemplateFile {
  const templateId = newTemplateId.trim();
  if (!templateId) {
    throw new LayoutPDFRuntimeError('NEW_TEMPLATE_ID_REQUIRED', 'New template id is required.');
  }
  const copy = structuredClone(source);
  copy.template.id = templateId;

  const assetIds = new Map<string, string>();
  const assets: TemplateFile['assets'] = {};
  for (const [oldId, asset] of Object.entries(copy.assets)) {
    const newId = idGenerator('asset');
    assetIds.set(oldId, newId);
    assets[newId] = asset;
  }
  copy.assets = assets;

  copy.template.pages = copy.template.pages.map(page => {
    const nextPage = { ...page, id: idGenerator('page') };
    if (nextPage.background.kind === 'pdf') {
      nextPage.background = {
        ...nextPage.background,
        assetId: assetIds.get(nextPage.background.assetId) ?? nextPage.background.assetId,
      };
    }
    const elementIds = new Map<string, string>();
    const sourceElements = nextPage.elements;
    for (const element of sourceElements) elementIds.set(element.id, idGenerator('el'));
    const outputIdsBySource = new Map<string, ReadonlyMap<string, string>>();
    nextPage.elements = sourceElements.map(element => {
      const oldElementId = element.id;
      const nextElement = {
        ...element,
        id: elementIds.get(oldElementId)!,
      } as TemplateElement<object>;
      remapImageAsset(nextElement, assetIds);
      const outputIds = remapTableIdentities(nextElement, idGenerator);
      if (outputIds.size > 0) outputIdsBySource.set(oldElementId, outputIds);
      remapGridIdentities(nextElement, idGenerator);
      return nextElement;
    });
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
    remapFormulaOutputReferences(nextPage.elements, formulaOutputReferences);
    remapElementGroupIds(nextPage.elements, idGenerator);
    remapTablePaginationElementReferences(nextPage.elements, elementIds, { dropUnmapped: true });
    remapElementOutputReferences(nextPage.elements, {
      elementIds,
      outputIdsBySource,
    }, {
      dropUnmappedSources: options.dropUnmappedOutputReferences,
    });
    return nextPage;
  });

  assertValidTemplateFile(copy);
  return copy;
}
