import type { AnyLayoutPDFPlugin, PluginRegistry } from '@/engine/core/plugin.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { createDefaultFontManager } from '@/engine/pdf/font/defaultFontManager.js';
import { createEngine, type CreateEngineOptions, type DocumentEngine } from '@/engine/createEngine.js';
import { plugins as defaultPlugins } from '@/plugins/index.js';

export interface CreateDefaultEngineOptions
  extends Omit<CreateEngineOptions, 'fontManager' | 'plugins'> {
  fontManager?: PdfFontManager;
  plugins?: PluginRegistry | readonly AnyLayoutPDFPlugin[];
}

export async function createDefaultEngine(
  options: CreateDefaultEngineOptions = {},
): Promise<DocumentEngine> {
  const fontManager = options.fontManager ?? await createDefaultFontManager();
  return createEngine({
    ...options,
    fontManager,
    plugins: options.plugins ?? defaultPlugins,
  });
}
