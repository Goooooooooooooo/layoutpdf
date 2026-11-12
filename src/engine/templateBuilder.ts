import {
  createBlankTemplateFile,
  createId,
  type CreateBlankTemplateOptions,
  type ElementBox,
  type IdGenerator,
  type InputBinding,
  type JsonValue,
  type TemplateElement,
  type TemplateFile,
  type TemplatePage,
} from '@/engine/core/document.js';
import type { AnyLayoutPDFPlugin, PluginRegistry } from '@/engine/core/plugin.js';
import { assertValidTemplateFile, TemplateFileSchema } from '@/engine/core/validation.js';
import { stringifyTemplateJson } from '@/engine/templateJson.js';

export interface TemplateBuilderOptions extends CreateBlankTemplateOptions {}

export interface AddElementOptions {
  id?: string;
  name?: string;
  pageIndex?: number;
  x?: number;
  y?: number;
  box?: Partial<ElementBox>;
  rotate?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  value?: JsonValue;
  binding?: InputBinding;
  props?: Record<string, unknown>;
}

export interface AddPageOptions {
  id?: string;
  size?: { width: number; height: number };
  padding?: [number, number, number, number];
  background?: TemplatePage['background'];
}

export class TemplateBuilder {
  private readonly file: TemplateFile;
  private readonly plugins: PluginRegistry;
  private readonly idGenerator: IdGenerator;

  constructor(plugins: PluginRegistry, options: TemplateBuilderOptions = {}) {
    this.plugins = plugins;
    this.idGenerator = options.idGenerator ?? createId;
    this.file = createBlankTemplateFile({ ...options, idGenerator: this.idGenerator });
  }

  setMetadata(metadata: NonNullable<TemplateFile['template']['metadata']>): this {
    this.file.template.metadata = { ...metadata };
    return this;
  }

  addPage(options: AddPageOptions = {}): this {
    const firstPage = this.file.template.pages[0];
    this.file.template.pages.push({
      id: options.id ?? this.idGenerator('page'),
      size: { ...(options.size ?? firstPage.size) },
      padding: [...(options.padding ?? firstPage.padding)],
      background: { ...(options.background ?? { kind: 'blank', color: '#ffffff' }) },
      elements: [],
    });
    return this;
  }

  addElement(type: string, options: AddElementOptions): this {
    const plugin: AnyLayoutPDFPlugin = this.plugins.require(type);
    const id = options.id ?? this.idGenerator('el');
    const element = plugin.createDefaultElement({
      id,
      position: {
        x: options.x ?? options.box?.x ?? 0,
        y: options.y ?? options.box?.y ?? 0,
      },
    });
    const pageIndex = options.pageIndex ?? 0;
    const page = this.file.template.pages[pageIndex];
    if (!page) throw new RangeError(`Template page ${pageIndex} does not exist.`);

    const next: TemplateElement<object> = {
      ...element,
      name: options.name ?? element.name,
      box: { ...element.box, ...options.box },
      rotate: options.rotate ?? element.rotate,
      opacity: options.opacity ?? element.opacity,
      locked: options.locked ?? element.locked,
      hidden: options.hidden ?? element.hidden,
      props: { ...element.props, ...options.props },
    };
    if (Object.prototype.hasOwnProperty.call(options, 'value')) next.value = options.value!;
    if (options.binding) next.binding = { ...options.binding };
    page.elements.push(next);
    return this;
  }

  buildJson(space = 2): string {
    return stringifyTemplateJson(this.build(), { space });
  }

  build(): TemplateFile {
    const parsed = TemplateFileSchema.parse(this.file);
    assertValidTemplateFile(parsed);
    return structuredClone(parsed);
  }
}
