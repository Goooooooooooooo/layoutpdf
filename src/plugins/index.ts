import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import type { AnyLayoutPDFPlugin } from '@/engine/core/plugin.js';
import { basicPlugins } from '@/plugins/basic.js';
import { businessPlugins } from '@/plugins/business.js';

const defaultOrder = [
  'label',
  'text',
  'number',
  'currency',
  'date',
  'select',
  'radiogroup',
  'calc',
  'checkbox',
  'line',
  'rect',
  'ellipse',
  'image',
  'qrcode',
  'barcode',
  'grid',
  'table',
  'summary',
] as const;

const byType = new Map<string, AnyLayoutPDFPlugin>(
  [...basicPlugins, ...businessPlugins].map(plugin => [plugin.metadata.type, plugin]),
);

/**
 * Batteries-included default plugin set. Lean consumers can import
 * `plugins/basic` or `plugins/business` instead.
 */
export const plugins: readonly AnyLayoutPDFPlugin[] = defaultOrder.map(type => {
  const plugin = byType.get(type);
  if (!plugin) throw new Error(`Default plugin is missing: ${type}`);
  return plugin;
});

export const pluginRegistry = createPluginRegistry(plugins);

export * from '@/plugins/basic.js';
