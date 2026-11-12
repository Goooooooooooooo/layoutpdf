import type { TemplateFile } from '@/engine/core/document.js';
import type { SettingsStorage } from '@/settings/settingsStorage.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';

export interface StoredTemplateSummary {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * Optional persistence hook for the standalone designer.
 *
 * Every method is optional: a host can implement only reusable blocks, only
 * templates, or provide its own backend. `createLocalDesignerStorage()` and
 * `createMemoryDesignerStorage()` are ready-made implementations.
 */
export interface DesignerStorageAdapter {
  listTemplates?(): Promise<StoredTemplateSummary[]>;
  loadTemplate?(id: string): Promise<TemplateFile | null>;
  saveTemplate?(template: TemplateFile): Promise<void>;
  deleteTemplate?(id: string): Promise<void>;
  listReusableBlocks?(): Promise<ReusableBlock[]>;
  saveReusableBlock?(block: ReusableBlock): Promise<void>;
  deleteReusableBlock?(id: string): Promise<void>;
}

interface StoredTemplateRecord extends StoredTemplateSummary {
  template: TemplateFile;
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function templateSummary(record: StoredTemplateRecord): StoredTemplateSummary {
  return { id: record.id, name: record.name, updatedAt: record.updatedAt };
}

/**
 * Stores templates and reusable blocks as JSON in any synchronous key/value
 * storage (for example `window.localStorage` or a test double).
 */
export function createStorageDesignerStorage(
  storage: SettingsStorage,
  prefix = 'layoutpdf',
): DesignerStorageAdapter {
  const templatesKey = `${prefix}:templates`;
  const blocksKey = `${prefix}:reusable-blocks`;

  const readTemplates = (): StoredTemplateRecord[] => parseArray<StoredTemplateRecord>(
    storage.getItem(templatesKey),
  );
  const writeTemplates = (records: StoredTemplateRecord[]): void => {
    storage.setItem(templatesKey, JSON.stringify(records));
  };
  const readBlocks = (): ReusableBlock[] => parseArray<ReusableBlock>(storage.getItem(blocksKey));
  const writeBlocks = (blocks: ReusableBlock[]): void => {
    storage.setItem(blocksKey, JSON.stringify(blocks));
  };

  return {
    async listTemplates() {
      return readTemplates().map(templateSummary);
    },
    async loadTemplate(id) {
      return readTemplates().find(record => record.id === id)?.template ?? null;
    },
    async saveTemplate(template) {
      const records = readTemplates();
      const record: StoredTemplateRecord = {
        id: template.template.id,
        name: template.template.name,
        updatedAt: new Date().toISOString(),
        template,
      };
      const index = records.findIndex(item => item.id === record.id);
      if (index >= 0) records[index] = record;
      else records.push(record);
      writeTemplates(records);
    },
    async deleteTemplate(id) {
      writeTemplates(readTemplates().filter(record => record.id !== id));
    },
    async listReusableBlocks() {
      return readBlocks();
    },
    async saveReusableBlock(block) {
      const blocks = readBlocks();
      const index = blocks.findIndex(item => item.id === block.id);
      if (index >= 0) blocks[index] = block;
      else blocks.push(block);
      writeBlocks(blocks);
    },
    async deleteReusableBlock(id) {
      writeBlocks(readBlocks().filter(block => block.id !== id));
    },
  };
}

/** In-memory adapter, useful for tests and ephemeral sessions. */
export function createMemoryDesignerStorage(): DesignerStorageAdapter {
  const data = new Map<string, string>();
  return createStorageDesignerStorage({
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  });
}

/**
 * Uses `window.localStorage` when available. Returns an in-memory adapter in
 * SSR or privacy-mode environments where storage access throws.
 */
export function createLocalDesignerStorage(prefix = 'layoutpdf'): DesignerStorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return createStorageDesignerStorage(window.localStorage, prefix);
    }
  } catch {
    // Fall through to memory storage.
  }
  return createMemoryDesignerStorage();
}
