import type { JsonValue } from '@/engine/core/document.js';
import type { AnyLayoutPDFPlugin, LayoutPDFPlugin } from '@/engine/core/plugin.js';

/**
 * Identity helper that preserves plugin prop/value inference at the call site.
 * Use it when authoring plugins so `propsSchema`, `createDefaultElement`, and
 * `buildRenderNodes` stay type-checked as one unit.
 */
export function definePlugin<
  TProps extends object,
  TValue extends JsonValue,
>(
  plugin: LayoutPDFPlugin<TProps, TValue>,
): LayoutPDFPlugin<TProps, TValue> {
  return plugin;
}

export interface PluginPack {
  id: string;
  plugins: readonly AnyLayoutPDFPlugin[];
}

/** Groups plugins so consumers can register them as one unit. */
export function definePluginPack<TPack extends PluginPack>(pack: TPack): TPack {
  return pack;
}
