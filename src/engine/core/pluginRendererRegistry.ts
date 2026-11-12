import type { AnyLayoutPDFPlugin, PluginNodeRenderer, PluginRenderers } from '@/engine/core/plugin.js';

export interface PluginRendererContribution<TContext = any> {
  pluginType: string;
  render: PluginNodeRenderer<TContext>;
}

export interface PluginRendererRegistry<TContext = any> {
  get(pluginType: string): PluginNodeRenderer<TContext> | undefined;
  require(pluginType: string): PluginNodeRenderer<TContext>;
  has(pluginType: string): boolean;
  list(): PluginRendererContribution<TContext>[];
}

export interface CreatePluginRendererRegistryOptions {
  /**
   * How duplicate `pluginType` contributions are handled. The engine uses
   * `override` so host applications can replace a plugin's default renderer.
   */
  onDuplicate?: 'error' | 'override';
}

export function createPluginRendererRegistry<TContext = any>(
  contributions: readonly PluginRendererContribution<TContext>[],
  options: CreatePluginRendererRegistryOptions = {},
): PluginRendererRegistry<TContext> {
  const byType = new Map<string, PluginNodeRenderer<TContext>>();
  const onDuplicate = options.onDuplicate ?? 'error';

  for (const contribution of contributions) {
    const pluginType = contribution.pluginType.trim();
    if (!pluginType) throw new Error('Plugin renderer requires a pluginType.');
    if (byType.has(pluginType)) {
      if (onDuplicate === 'error') {
        throw new Error(`Duplicate plugin renderer: ${pluginType}`);
      }
      byType.delete(pluginType);
    }
    byType.set(pluginType, contribution.render);
  }

  return {
    get(pluginType) {
      return byType.get(pluginType);
    },
    require(pluginType) {
      const renderer = byType.get(pluginType);
      if (!renderer) throw new Error(`No renderer registered for plugin type: ${pluginType}`);
      return renderer;
    },
    has(pluginType) {
      return byType.has(pluginType);
    },
    list() {
      return [...byType].map(([pluginType, render]) => ({ pluginType, render }));
    },
  };
}

export function collectPluginRenderers<TContext = any>(
  plugins: readonly AnyLayoutPDFPlugin[],
  target: keyof PluginRenderers,
): PluginRendererContribution<TContext>[] {
  const contributions: PluginRendererContribution<TContext>[] = [];
  for (const plugin of plugins) {
    const renderer = plugin.renderers?.[target];
    if (!renderer) continue;
    contributions.push({
      pluginType: plugin.metadata.type,
      render: renderer as PluginNodeRenderer<TContext>,
    });
  }
  return contributions;
}
