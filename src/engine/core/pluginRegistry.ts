import type { TemplateElement } from '@/engine/core/document.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import type { AnyLayoutPDFPlugin, PluginRegistry } from '@/engine/core/plugin.js';
import { TemplateElementSchema } from '@/engine/core/validation.js';

const PROPERTY_ROOTS = new Set([
  'name',
  'box',
  'rotate',
  'opacity',
  'locked',
  'hidden',
  'value',
  'binding',
  'props',
]);

function validatePropertyDefinitions(plugin: AnyLayoutPDFPlugin): void {
  const paths = new Set<string>();
  for (const property of plugin.properties) {
    const root = property.path.split('.')[0];
    if (!root || !PROPERTY_ROOTS.has(root)) {
      throw new Error(`Plugin "${plugin.metadata.type}" has invalid property path: ${property.path}`);
    }
    if (paths.has(property.path)) {
      throw new Error(`Plugin "${plugin.metadata.type}" has duplicate property path: ${property.path}`);
    }
    paths.add(property.path);
  }
}

function validateDefaultElement(plugin: AnyLayoutPDFPlugin): void {
  const element = plugin.createDefaultElement({
    id: 'el_registry_validation',
    position: { x: 0, y: 0 },
  });

  if (element.id !== 'el_registry_validation') {
    throw new Error(`Plugin "${plugin.metadata.type}" must preserve the supplied element id`);
  }
  if (element.type !== plugin.metadata.type) {
    throw new Error(
      `Plugin type mismatch: metadata is "${plugin.metadata.type}" but default element is "${element.type}"`,
    );
  }

  const base = TemplateElementSchema.safeParse(element);
  if (!base.success) {
    throw new Error(`Plugin "${plugin.metadata.type}" has invalid default element: ${base.error.message}`);
  }

  const props = plugin.propsSchema.safeParse(element.props);
  if (!props.success) {
    throw new Error(`Plugin "${plugin.metadata.type}" has invalid default props: ${props.error.message}`);
  }

  const value = plugin.valueSchema.safeParse(element.value);
  if (!value.success) {
    throw new Error(`Plugin "${plugin.metadata.type}" has invalid default value: ${value.error.message}`);
  }
}

function zodIssues(
  plugin: AnyLayoutPDFPlugin,
  element: TemplateElement<object>,
): RenderIssue[] {
  const issues: RenderIssue[] = [];
  const props = plugin.propsSchema.safeParse(element.props);
  if (!props.success) {
    for (const issue of props.error.issues) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PLUGIN_PROPS',
        message: issue.message,
        elementId: element.id,
        path: ['props', ...issue.path].join('.'),
      });
    }
  }

  const value = plugin.valueSchema.safeParse(element.value);
  if (!value.success) {
    for (const issue of value.error.issues) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PLUGIN_VALUE',
        message: issue.message,
        elementId: element.id,
        path: ['value', ...issue.path].join('.'),
      });
    }
  }

  return issues;
}

export function createPluginRegistry<TPlugin extends AnyLayoutPDFPlugin>(
  plugins: readonly TPlugin[],
): PluginRegistry {
  const byType = new Map<string, AnyLayoutPDFPlugin>();

  for (const plugin of plugins) {
    const type = plugin.metadata.type.trim();
    if (!type) throw new Error('Plugin type is required');
    if (byType.has(type)) throw new Error(`Duplicate plugin type: ${type}`);
    validatePropertyDefinitions(plugin);
    validateDefaultElement(plugin);
    byType.set(type, plugin);
  }

  return {
    get(type) {
      return byType.get(type);
    },

    require(type) {
      const plugin = byType.get(type);
      if (!plugin) throw new Error(`Unknown plugin type: ${type}`);
      return plugin;
    },

    list() {
      return [...byType.values()];
    },

    validateElement(element) {
      const plugin = byType.get(element.type);
      if (!plugin) {
        return [{
          severity: 'error',
          code: 'UNKNOWN_PLUGIN',
          message: `Unknown plugin type: ${element.type}`,
          elementId: element.id,
        }];
      }
      return zodIssues(plugin, element);
    },
  };
}
