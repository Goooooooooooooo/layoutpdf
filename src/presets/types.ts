import type { IdGenerator, TemplateElement } from '@/engine/core/document.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import type { MessageKey } from '@/i18n/index.js';

export interface ElementPreset {
  id: string;
  label: string;
  labelKey?: MessageKey;
  category: string;
  createElements(args: {
    pageId: string;
    origin: { x: number; y: number };
    registry: PluginRegistry;
    createId: IdGenerator;
  }): TemplateElement<object>[];
}
