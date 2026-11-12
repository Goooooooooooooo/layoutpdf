export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type IdPrefix = 'tpl' | 'page' | 'el' | 'group' | 'asset' | 'row' | 'col' | 'footer';
export type IdGenerator = (prefix: IdPrefix) => string;

const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBase36(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += BASE36_CHARS[bytes[i] % 36];
  }
  return result;
}

export const createId: IdGenerator = (prefix) => `${prefix}_${randomBase36(12)}`;

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InputBinding {
  key: string;
  required?: boolean;
}

export interface TemplateElement<
  TProps extends object = JsonObject,
  TValue extends JsonValue = JsonValue,
> {
  id: string;
  type: string;
  name: string;
  box: ElementBox;
  rotate: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  presetId?: string;
  groupId?: string;
  value: TValue;
  binding?: InputBinding;
  props: TProps;
}

export type PageBackground =
  | { kind: 'blank'; color?: string }
  | { kind: 'pdf'; assetId: string; pageIndex: number };

export interface TemplatePage {
  id: string;
  size: {
    width: number;
    height: number;
  };
  padding: [number, number, number, number];
  background: PageBackground;
  elements: TemplateElement<object>[];
}

export interface TemplateMetadata {
  title?: string;
  author?: string;
  subject?: string;
  language?: string;
}

export interface LayoutPDFTemplate {
  version: 3;
  id: string;
  name: string;
  metadata?: TemplateMetadata;
  pages: TemplatePage[];
}

export type TemplateAsset =
  | {
      kind: 'pdf';
      name: string;
      mimeType: 'application/pdf';
      dataEncoding: 'base64';
      data: string;
    }
  | {
      kind: 'image';
      name: string;
      mimeType: 'image/png' | 'image/jpeg';
      dataEncoding: 'base64';
      data: string;
    };

export interface TemplateFile {
  format: 'layoutpdf-template';
  version: 3;
  template: LayoutPDFTemplate;
  assets: Record<string, TemplateAsset>;
}

export interface CreateBlankTemplateOptions {
  idGenerator?: IdGenerator;
  name?: string;
  pageSize?: { width: number; height: number };
  padding?: [number, number, number, number];
}

export function createBlankTemplateFile(options: CreateBlankTemplateOptions = {}): TemplateFile {
  const idGenerator = options.idGenerator ?? createId;
  const pageSize = options.pageSize ?? { width: 210, height: 297 };
  const padding = options.padding ?? [10, 10, 10, 10];

  return {
    format: 'layoutpdf-template',
    version: 3,
    assets: {},
    template: {
      version: 3,
      id: idGenerator('tpl'),
      name: options.name ?? '新規テンプレート',
      pages: [{
        id: idGenerator('page'),
        size: { ...pageSize },
        padding: [...padding],
        background: { kind: 'blank', color: '#ffffff' },
        elements: [],
      }],
    },
  };
}
