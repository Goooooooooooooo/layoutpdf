import type { AnyLayoutPDFPlugin, PluginRegistry } from '@/engine/core/plugin.js';
import type { PdfFontManager } from '@/engine/pdf/font/fontManager.js';
import { createDefaultFontManager } from '@/engine/pdf/font/defaultFontManager.js';
import { createEngine, type CreateEngineOptions, type DocumentEngine } from '@/engine/createEngine.js';
import { plugins as defaultPlugins } from '@/plugins/index.js';

export interface CreateDefaultEngineOptions
  extends Omit<CreateEngineOptions, 'fontManager' | 'plugins'> {
  fontManager?: PdfFontManager;
  plugins?: PluginRegistry | readonly AnyLayoutPDFPlugin[];
  /**
   * Face used when an element does not set `props.fontName`, e.g.
   * `'Noto Sans CJK JP Regular'`. Cannot be combined with `fontManager`; pass
   * it to `createFontManager` instead.
   */
  defaultFont?: string;
}

export async function createDefaultEngine(
  options: CreateDefaultEngineOptions = {},
): Promise<DocumentEngine> {
  const { fontManager, plugins, defaultFont, ...engineOptions } = options;
  if (fontManager && defaultFont) {
    throw new Error(
      'createDefaultEngine: defaultFont cannot be combined with a prebuilt fontManager. '
      + 'Pass defaultFont to createFontManager instead.',
    );
  }
  const manager = fontManager ?? await createDefaultFontManager('/fonts/', { defaultFont });
  return createEngine({
    ...engineOptions,
    fontManager: manager,
    plugins: plugins ?? defaultPlugins,
  });
}
