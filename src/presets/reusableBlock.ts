import { createId, type IdGenerator, type TemplateAsset, type TemplateElement } from '@/engine/core/document.js';
import { cloneTemplateFileWithNewIds } from '@/engine/core/cloneTemplateFile.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';
import { normalizeElementGroups } from '@/engine/core/elementGroups.js';

function referencedAssetIds(elements: TemplateElement<object>[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.type !== 'image' || !element.value || typeof element.value !== 'object' || Array.isArray(element.value)) continue;
    const value = element.value as Record<string, unknown>;
    if (value.source === 'asset' && typeof value.assetId === 'string') ids.add(value.assetId);
  }
  return ids;
}

export function createReusableBlock(options: {
  name: string;
  elements: TemplateElement<object>[];
  assets: Record<string, TemplateAsset>;
  idGenerator?: IdGenerator;
  now?: () => Date;
}): ReusableBlock {
  if (options.elements.length === 0) throw new Error('At least one element is required.');
  if (!options.name.trim()) throw new Error('Reusable block name is required.');
  const idGenerator = options.idGenerator ?? createId;
  const minX = Math.min(...options.elements.map(element => element.box.x));
  const minY = Math.min(...options.elements.map(element => element.box.y));
  const elements = structuredClone(options.elements);
  elements.forEach(element => {
    element.box = { ...element.box, x: element.box.x - minX, y: element.box.y - minY };
    delete element.presetId;
  });
  normalizeElementGroups({ elements });
  const assets: Record<string, TemplateAsset> = {};
  for (const id of referencedAssetIds(elements)) {
    if (options.assets[id]) assets[id] = structuredClone(options.assets[id]);
  }
  return {
    version: 1,
    id: idGenerator('tpl'),
    name: options.name.trim(),
    elements,
    assets,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}

export function instantiateReusableBlock(
  block: ReusableBlock,
  origin: { x: number; y: number },
  idGenerator: IdGenerator = createId,
): {
  elements: TemplateElement<object>[];
  assets: Record<string, TemplateAsset>;
  removedOutputReferenceCount: number;
} {
  const source = {
    format: 'layoutpdf-template' as const,
    version: 3 as const,
    template: {
      version: 3 as const,
      id: block.id,
      name: block.name,
      pages: [{
        id: 'block-page',
        size: { width: 210, height: 297 },
        padding: [0, 0, 0, 0] as [number, number, number, number],
        background: { kind: 'blank' as const },
        elements: structuredClone(block.elements),
      }],
    },
    assets: structuredClone(block.assets),
  };
  const copy = cloneTemplateFileWithNewIds(source, idGenerator('tpl'), idGenerator, {
    dropUnmappedOutputReferences: true,
  });
  const elements = copy.template.pages[0].elements;
  const countReferences = (items: TemplateElement<object>[]) => items.reduce((count, element) => {
    if (element.type !== 'summary') return count;
    const summaryItems = (element.props as Record<string, unknown>).items;
    return count + (Array.isArray(summaryItems) ? summaryItems.length : 0);
  }, 0);
  const removedOutputReferenceCount = Math.max(
    0,
    countReferences(block.elements) - countReferences(elements),
  );
  elements.forEach(element => {
    element.box = { ...element.box, x: element.box.x + origin.x, y: element.box.y + origin.y };
  });
  return { elements, assets: copy.assets, removedOutputReferenceCount };
}
