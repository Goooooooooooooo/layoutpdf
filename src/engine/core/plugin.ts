import type { ZodType } from 'zod';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
  TemplateElement,
} from '@/engine/core/document.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import type { InputRecord } from '@/engine/core/input.js';
import type { PluginNode, RenderNode } from '@/engine/renderTree/model.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';

export interface PluginMetadata {
  type: string;
  label: string;
  labelKey?: string;
  category: 'basic' | 'data' | 'layout' | 'business';
  icon?: string;
  bindingValueKind?: 'text' | 'number' | 'date' | 'boolean' | 'table';
}

export type PropertyEditor = string;

export interface PropertyDefinition {
  path: string;
  label: string;
  labelKey?: string;
  editor: PropertyEditor;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; labelKey?: string; value: JsonPrimitive; icon?: string }>;
  group?: 'content' | 'layout' | 'style' | 'data' | 'advanced';
  cleareable?: boolean;
}

export interface RenderBuildContext {
  pageId: string;
  pageSize: { width: number; height: number };
  input: InputRecord;
  fontManager: FontManager;
  format: FormatLocaleSettings;
  createNodeId(localId?: string): string;
  report(issue: RenderIssue): void;
}

export interface BuildRenderNodesArgs<
  TProps extends object,
  TValue extends JsonValue,
> {
  element: TemplateElement<TProps, TValue>;
  value: TValue;
  context: RenderBuildContext;
}

/**
 * A renderer for a `plugin` node. Each output adapter supplies its own
 * context type; the `any` keeps plugin definitions usable across adapters
 * without importing React or pdf-lib into the plugin contract.
 */
export type PluginNodeRenderer<TContext = any> = (
  node: PluginNode,
  context: TContext,
) => unknown | Promise<unknown>;

export interface DomPluginRenderContext {
  mode: 'designer' | 'form' | 'preview';
  zoom: number;
}

export interface PluginRenderers {
  pdf?: PluginNodeRenderer;
  /** DOM preview adapter. React previews expect a ReactNode return value. */
  dom?: PluginNodeRenderer<DomPluginRenderContext>;
}

export interface LayoutPDFPlugin<
  TProps extends object = JsonObject,
  TValue extends JsonValue = JsonValue,
> {
  metadata: PluginMetadata;
  propsSchema: ZodType<TProps>;
  valueSchema: ZodType<TValue>;
  createDefaultElement(args: {
    id: string;
    position: { x: number; y: number };
  }): TemplateElement<TProps, TValue>;
  properties: PropertyDefinition[];
  buildRenderNodes(args: BuildRenderNodesArgs<TProps, TValue>): RenderNode[];
  /** Optional custom painting for nodes returned as `kind: 'plugin'`. */
  renderers?: PluginRenderers;
}

// Plugin registries are intentionally heterogeneous. Concrete plugins keep
// their precise props/value types before they enter the registry boundary.
export type AnyLayoutPDFPlugin = LayoutPDFPlugin<any, any>;

export interface PluginRegistry {
  get(type: string): AnyLayoutPDFPlugin | undefined;
  require(type: string): AnyLayoutPDFPlugin;
  list(): AnyLayoutPDFPlugin[];
  validateElement(element: TemplateElement<object>): RenderIssue[];
}
