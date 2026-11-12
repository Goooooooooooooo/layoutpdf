import type { TemplateFile } from '@/engine/core/document.js';
import type { PluginRegistry, PluginMetadata } from '@/engine/core/plugin.js';

export type BindingValueKind = NonNullable<PluginMetadata['bindingValueKind']>;

export interface BindingFieldUsage {
  elementId: string;
  elementName: string;
  elementType: string;
  pageId: string;
  kind: BindingValueKind;
}

export interface BindingFieldEntry {
  key: string;
  kinds: BindingValueKind[];
  usages: BindingFieldUsage[];
  hasConflict: boolean;
}

export function buildBindingFieldIndex(
  templateFile: TemplateFile,
  registry: PluginRegistry,
): BindingFieldEntry[] {
  const fields = new Map<string, BindingFieldUsage[]>();
  for (const page of templateFile.template.pages) {
    for (const element of page.elements) {
      if (element.type === 'table') {
        const props = element.props as { footers?: Array<{ label?: string; outputFieldKey?: string }> };
        for (const footer of props.footers ?? []) {
          const outputKey = footer.outputFieldKey?.trim();
          if (!outputKey) continue;
          const outputUsages = fields.get(outputKey) ?? [];
          outputUsages.push({
            elementId: element.id,
            elementName: `${element.name} / ${footer.label ?? outputKey}`,
            elementType: element.type,
            pageId: page.id,
            kind: 'number',
          });
          fields.set(outputKey, outputUsages);
        }
      }
      const key = element.binding?.key.trim();
      const kind = registry.get(element.type)?.metadata.bindingValueKind;
      if (!key || !kind) continue;
      const usages = fields.get(key) ?? [];
      usages.push({
        elementId: element.id,
        elementName: element.name,
        elementType: element.type,
        pageId: page.id,
        kind,
      });
      fields.set(key, usages);

    }
  }
  return [...fields.entries()]
    .map(([key, usages]) => {
      const kinds = [...new Set(usages.map(usage => usage.kind))];
      return { key, kinds, usages, hasConflict: kinds.length > 1 };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function getCompatibleBindingKeys(
  entries: BindingFieldEntry[],
  kind: BindingValueKind | undefined,
): string[] {
  if (!kind) return [];
  return entries
    .filter(entry => !entry.hasConflict && entry.kinds[0] === kind)
    .map(entry => entry.key);
}

export function getBindingConflict(
  entries: BindingFieldEntry[],
  key: string,
  kind: BindingValueKind | undefined,
  ignoredElementIds: ReadonlySet<string>,
): BindingFieldEntry | undefined {
  if (!kind || !key.trim()) return undefined;
  const entry = entries.find(candidate => candidate.key === key.trim());
  if (!entry) return undefined;
  const foreignKinds = new Set(
    entry.usages
      .filter(usage => !ignoredElementIds.has(usage.elementId))
      .map(usage => usage.kind),
  );
  return [...foreignKinds].some(foreignKind => foreignKind !== kind) ? entry : undefined;
}
