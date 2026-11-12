import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InputRecord } from '@/engine/core/input.js';
import type { TemplateFile } from '@/engine/core/document.js';
import type { DocumentEngine } from '@/engine/createEngine.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import type { ElementPreset } from '@/presets/types.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';
import type { DesignerStorageAdapter } from '@/storage/designerStorageAdapter.js';
import type { SettingsStorage } from '@/settings/settingsStorage.js';
import type { DesignerPropertyEditors } from './propertyEditors.js';
import type { DesignerCommandApi } from './commands.js';
import type { GeneratePdfOptions } from '@/engine/documentSession.js';
import { t, type AppLocale } from '@/i18n/index.js';
import type { DesignerTheme } from './theme.js';
import Designer from './Designer.js';
import { injectDesignerStyles } from './styles.js';

export interface LayoutPDFDesignerElementApi extends HTMLElement {
  engine: DocumentEngine | undefined;
  template: TemplateFile | undefined;
  input: InputRecord | undefined;
  presets: ElementPreset[] | undefined;
  reusableBlocks: ReusableBlock[] | undefined;
  theme: DesignerTheme | undefined;
  storage: SettingsStorage | undefined;
  settingsKey: string | undefined;
  propertyEditors: DesignerPropertyEditors | undefined;
  storageAdapter: DesignerStorageAdapter | undefined;
  locale: AppLocale | undefined;
  readonly commands: DesignerCommandApi | undefined;
  getTemplate(): TemplateFile | undefined;
  loadTemplate(template: TemplateFile): void;
  exportJson(options?: { space?: number }): string;
  preview(): RenderDocument | undefined;
  generatePdf(options?: GeneratePdfOptions): Promise<Uint8Array>;
  saveTemplate(): Promise<void>;
}

/**
 * `HTMLElement` only exists in a browser. SSR frameworks (Next.js, Nuxt,
 * SvelteKit) still evaluate this module on the server, so the class falls back
 * to a plain base there and `registerLayoutPDFDesigner()` becomes a no-op.
 */
const HTMLElementBase: typeof HTMLElement = typeof HTMLElement === 'undefined'
  ? (class {} as unknown as typeof HTMLElement)
  : HTMLElement;

export class LayoutPDFDesignerElementImpl extends HTMLElementBase {
  static get observedAttributes(): string[] { return ['template-json', 'input-json']; }
  private root?: Root;
  private _engine?: DocumentEngine;
  private _template?: TemplateFile;
  private _input?: InputRecord;
  private _presets?: ElementPreset[];
  private _reusableBlocks?: ReusableBlock[];
  private _theme?: DesignerTheme;
  private _storage?: SettingsStorage;
  private _settingsKey?: string;
  private _propertyEditors?: DesignerPropertyEditors;
  private _storageAdapter?: DesignerStorageAdapter;
  private _locale?: AppLocale;
  private _commands?: DesignerCommandApi;
  private readonly assignCommands = (api: DesignerCommandApi | null) => {
    this._commands = api ?? undefined;
  };

  get engine(): DocumentEngine | undefined { return this._engine; }
  set engine(value: DocumentEngine | undefined) {
    this._engine = value;
    this.readJsonAttributes();
    this.render();
  }
  get template(): TemplateFile | undefined { return this._template; }
  set template(value: TemplateFile | undefined) {
    if (this._template === value) return;
    this._template = value;
    this.render();
  }
  get input(): InputRecord | undefined { return this._input; }
  set input(value: InputRecord | undefined) { this._input = value; this.render(); }
  get presets(): ElementPreset[] | undefined { return this._presets; }
  set presets(value: ElementPreset[] | undefined) { this._presets = value; this.render(); }
  get reusableBlocks(): ReusableBlock[] | undefined { return this._reusableBlocks; }
  set reusableBlocks(value: ReusableBlock[] | undefined) { this._reusableBlocks = value; this.render(); }
  get theme(): DesignerTheme | undefined { return this._theme; }
  set theme(value: DesignerTheme | undefined) { this._theme = value; this.render(); }
  get storage(): SettingsStorage | undefined { return this._storage; }
  set storage(value: SettingsStorage | undefined) { this._storage = value; this.render(); }
  get settingsKey(): string | undefined { return this._settingsKey; }
  set settingsKey(value: string | undefined) { this._settingsKey = value; this.render(); }
  get propertyEditors(): DesignerPropertyEditors | undefined { return this._propertyEditors; }
  set propertyEditors(value: DesignerPropertyEditors | undefined) { this._propertyEditors = value; this.render(); }
  get storageAdapter(): DesignerStorageAdapter | undefined { return this._storageAdapter; }
  set storageAdapter(value: DesignerStorageAdapter | undefined) { this._storageAdapter = value; this.render(); }
  get locale(): AppLocale | undefined { return this._locale; }
  set locale(value: AppLocale | undefined) { this._locale = value; this.render(); }
  get commands(): DesignerCommandApi | undefined { return this._commands; }

  getTemplate(): TemplateFile | undefined {
    return this._commands?.getTemplate() ?? this._template;
  }
  loadTemplate(template: TemplateFile): void {
    if (this._commands) this._commands.loadTemplate(template);
    else this._template = template;
    this.render();
  }
  exportJson(options?: { space?: number }): string {
    return this._commands?.exportJson(options) ?? '';
  }
  preview(): RenderDocument | undefined {
    return this._commands?.preview();
  }
  generatePdf(options?: GeneratePdfOptions): Promise<Uint8Array> {
    if (!this._commands) {
      return Promise.reject(new Error('The designer is not mounted yet.'));
    }
    return this._commands.generatePdf(options);
  }
  saveTemplate(): Promise<void> {
    return this._commands?.saveTemplate() ?? Promise.resolve();
  }

  connectedCallback(): void {
    this.injectStyles();
    this.root = createRoot(this);
    this.readJsonAttributes();
    this.render();
  }
  disconnectedCallback(): void { this.root?.unmount(); this.root = undefined; }
  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue && this.isConnected) this.readJsonAttributes();
  }

  private injectStyles(): void {
    injectDesignerStyles();
  }
  private readJsonAttributes(): void {
    if (!this._engine) return;
    try {
      const templateJson = this.getAttribute('template-json');
      if (templateJson) this._template = this._engine.parseTemplateJson(templateJson);
      const inputJson = this.getAttribute('input-json');
      if (inputJson) this._input = JSON.parse(inputJson) as InputRecord;
    } catch (error) {
      this.emit('designer-error', error instanceof Error ? error : new Error(String(error)));
    }
  }
  private emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
  private render(): void {
    if (!this.root) return;
    if (!this._engine || !this._template) {
      this.root.render(createElement('div', { className: 'layoutpdf-designer-empty' }, t('designer.emptyState')));
      return;
    }
    this.root.render(createElement(Designer, {
      ref: this.assignCommands,
      engine: this._engine,
      template: this._template,
      input: this._input,
      presets: this._presets,
      reusableBlocks: this._reusableBlocks,
      theme: this._theme,
      storage: this._storage,
      settingsKey: this._settingsKey,
      propertyEditors: this._propertyEditors,
      storageAdapter: this._storageAdapter,
      locale: this._locale,
      onTemplateChange: (template: TemplateFile) => this.emit('template-change', template),
      onPreview: (layout: RenderDocument) => this.emit('preview', layout),
      onExportJson: (json: string) => this.emit('template-json-export', json),
      onPdf: (pdf: Uint8Array) => this.emit('pdf-generated', pdf),
      onError: (error: Error) => this.emit('designer-error', error),
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'layoutpdf-designer': LayoutPDFDesignerElementApi;
  }
  interface HTMLElementEventMap {
    'template-change': CustomEvent<TemplateFile>;
    'preview': CustomEvent<RenderDocument>;
    'template-json-export': CustomEvent<string>;
    'pdf-generated': CustomEvent<Uint8Array>;
    'designer-error': CustomEvent<Error>;
  }
}

export function registerLayoutPDFDesigner(tagName = 'layoutpdf-designer'): void {
  // Server rendering has no custom element registry. Skip instead of throwing
  // so `import 'layoutpdf/designer'` is safe in any module graph.
  if (typeof HTMLElement === 'undefined' || !globalThis.customElements) return;
  // Inject styles as soon as the entry is imported so both the custom element
  // and direct React `<Designer>` usage are styled.
  injectDesignerStyles();
  if (customElements.get(tagName)) return;
  customElements.define(tagName, LayoutPDFDesignerElementImpl);
}

registerLayoutPDFDesigner();
