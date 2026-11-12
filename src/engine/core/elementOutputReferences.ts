import type { TemplateElement } from '@/engine/core/document.js';

export interface ElementOutputRemap {
  elementIds: ReadonlyMap<string, string>;
  outputIdsBySource: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export function remapElementOutputReferences(
  elements: TemplateElement<object>[],
  remap: ElementOutputRemap,
  options: {
    dropUnmappedSources?: boolean;
    dropUnmappedReference?: (sourceElementId: string, outputId: string) => boolean;
  } = {},
): number {
  let removed = 0;
  for (const element of elements) {
    if (element.type !== 'summary') continue;
    const props = element.props as Record<string, unknown>;
    if (!Array.isArray(props.items)) continue;
    props.items = props.items.flatMap(rawItem => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return [rawItem];
      const item = rawItem as Record<string, unknown>;
      const rawSource = item.source;
      if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) return [rawItem];
      const source = rawSource as Record<string, unknown>;
      const oldSourceId = typeof source.sourceElementId === 'string'
        ? source.sourceElementId
        : '';
      const oldOutputId = typeof source.outputId === 'string' ? source.outputId : '';
      const sourceElementId = remap.elementIds.get(oldSourceId);
      if (
        !sourceElementId
        && (
          options.dropUnmappedSources
          || options.dropUnmappedReference?.(oldSourceId, oldOutputId)
        )
      ) {
        removed += 1;
        return [];
      }
      const outputId = remap.outputIdsBySource.get(oldSourceId)?.get(oldOutputId)
        ?? oldOutputId;
      return [{
        ...item,
        source: {
          ...source,
          sourceElementId: sourceElementId ?? oldSourceId,
          outputId,
        },
      }];
    });
  }
  return removed;
}
