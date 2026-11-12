import {
  createId,
  type IdGenerator,
  type TemplateAsset,
  type TemplateElement,
  type TemplateFile,
  type TemplatePage,
} from '@/engine/core/document.js';
import {
  remapFormulaOutputReferences,
  remapGridIdentities,
  remapTableIdentities,
} from '@/engine/core/cloneTemplateFile.js';
import { remapElementOutputReferences } from '@/engine/core/elementOutputReferences.js';
import { remapElementGroupIds } from '@/engine/core/elementGroups.js';
import { remapTablePaginationElementReferences } from '@/engine/core/tablePaginationReferences.js';
import { createFormulaOutputReference } from '@/utils/calc.js';

export interface EditorClipboardPayload {
  sourceTemplateId: string;
  sourcePageId: string;
  elements: TemplateElement<object>[];
  assets: Record<string, TemplateAsset>;
}

function imageAssetId(element: TemplateElement<object>): string | undefined {
  if (element.type !== 'image' || !element.value || typeof element.value !== 'object' || Array.isArray(element.value)) {
    return undefined;
  }
  const value = element.value as Record<string, unknown>;
  return value.source === 'asset' && typeof value.assetId === 'string'
    ? value.assetId
    : undefined;
}

function remapImageAsset(
  element: TemplateElement<object>,
  assetIds: Map<string, string>,
): void {
  const assetId = imageAssetId(element);
  if (!assetId) return;
  element.value = {
    ...(element.value as Record<string, unknown>),
    assetId: assetIds.get(assetId) ?? assetId,
  };
}

export function createEditorClipboardPayload(
  file: TemplateFile,
  selectedElementIds: string[],
): EditorClipboardPayload | null {
  const selectedIds = new Set(selectedElementIds);
  if (selectedIds.size === 0) return null;

  const sourcePages = file.template.pages.map(page => ({
    page,
    elements: page.elements.filter(element => selectedIds.has(element.id)),
  })).filter(entry => entry.elements.length > 0);
  // Editor selection is page-scoped; rejecting mixed-page payloads keeps output references unambiguous.
  if (sourcePages.length !== 1) return null;
  const [{ page: sourcePage, elements }] = sourcePages;
  if (elements.length === 0) return null;

  const assets: Record<string, TemplateAsset> = {};
  for (const element of elements) {
    const assetId = imageAssetId(element);
    const asset = assetId ? file.assets[assetId] : undefined;
    if (assetId && asset) assets[assetId] = structuredClone(asset);
  }

  return {
    sourceTemplateId: file.template.id,
    sourcePageId: sourcePage.id,
    elements: structuredClone(elements),
    assets,
  };
}

export interface InstantiateEditorClipboardOptions {
  destinationTemplateId: string;
  destinationPage: Pick<TemplatePage, 'id' | 'elements'>;
  offset?: number;
  idGenerator?: IdGenerator;
}

function pageOutputReferences(page: Pick<TemplatePage, 'elements'>): Set<string> {
  const references = new Set<string>();
  for (const element of page.elements) {
    if (element.type !== 'table' || element.hidden) continue;
    const props = element.props as Record<string, unknown>;
    if (!Array.isArray(props.footers)) continue;
    for (const footer of props.footers) {
      if (!footer || typeof footer !== 'object' || Array.isArray(footer)) continue;
      const outputId = (footer as Record<string, unknown>).id;
      if (typeof outputId === 'string') {
        references.add(`${element.id}\u0000${outputId}`);
      }
    }
  }
  return references;
}

export function instantiateEditorClipboard(
  payload: EditorClipboardPayload,
  options: InstantiateEditorClipboardOptions,
): {
  elements: TemplateElement<object>[];
  assets: Record<string, TemplateAsset>;
  removedOutputReferenceCount: number;
} {
  const idGenerator = options.idGenerator ?? createId;
  const offset = options.offset ?? 0;
  const assetIds = new Map<string, string>();
  const assets: Record<string, TemplateAsset> = {};

  for (const [assetId, asset] of Object.entries(payload.assets)) {
    const nextAssetId = idGenerator('asset');
    assetIds.set(assetId, nextAssetId);
    assets[nextAssetId] = structuredClone(asset);
  }

  const elementIds = new Map(payload.elements.map(source => [source.id, idGenerator('el')]));
  const outputIdsBySource = new Map<string, ReadonlyMap<string, string>>();
  const destinationOutputReferences = pageOutputReferences(options.destinationPage);
  const canPreserveDestinationReferences = payload.sourceTemplateId === options.destinationTemplateId
    && payload.sourcePageId === options.destinationPage.id;
  const elements = payload.elements.map(source => {
    const element = structuredClone(source);
    element.id = elementIds.get(source.id)!;
    element.box = {
      ...element.box,
      x: element.box.x + offset,
      y: element.box.y + offset,
    };
    delete element.presetId;
    const outputIds = remapTableIdentities(element, idGenerator);
    if (outputIds.size > 0) outputIdsBySource.set(source.id, outputIds);
    remapGridIdentities(element, idGenerator);
    remapImageAsset(element, assetIds);
    if (element.binding) {
      element.binding = { ...element.binding, key: `field_${element.id}` };
    }
    return element;
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
  remapFormulaOutputReferences(elements, formulaOutputReferences);
  remapElementGroupIds(elements, idGenerator);
  remapTablePaginationElementReferences(elements, elementIds, { dropUnmapped: true });

  const removedOutputReferenceCount = remapElementOutputReferences(elements, {
    elementIds,
    outputIdsBySource,
  }, {
    // Unmapped references are safe only when the original producer still exists on the same page.
    dropUnmappedReference: (sourceElementId, outputId) =>
      !canPreserveDestinationReferences
      || !destinationOutputReferences.has(`${sourceElementId}\u0000${outputId}`),
  });

  return { elements, assets, removedOutputReferenceCount };
}
