import { createFontManager } from '@/engine/pdf/font/fontManager.js';

const NODE_GUIDANCE =
  "Bundled fonts are loaded from a browser URL. In Node, use createNodeEngine() from 'layoutpdf/pdf/node', pass an absolute font base URL, or provide a custom fontManager.";

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load bundled font (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

function resolveFontBase(baseUrl: string): URL {
  let base: URL | undefined;
  try {
    base = new URL(baseUrl);
  } catch {
    // Relative URLs are resolved against the page in browsers.
  }
  if (!base) {
    if (typeof location === 'undefined') throw new Error(NODE_GUIDANCE);
    base = new URL(baseUrl, location.href);
  }
  if (base.protocol === 'file:') throw new Error(NODE_GUIDANCE);
  return base;
}

export async function createDefaultFontManager(baseUrl = '/fonts/'): Promise<ReturnType<typeof createFontManager>> {
  const base = resolveFontBase(baseUrl);
  const [regular, bold] = await Promise.all([
    loadFontBytes(new URL('NotoSansCJKjp-Regular.otf', base).href),
    loadFontBytes(new URL('NotoSansCJKjp-Bold.otf', base).href),
  ]);
  return createFontManager({
    'Noto Sans CJK JP Regular': {
      data: regular,
      fallback: true,
      family: 'Noto Sans CJK JP',
      weight: 'normal',
    },
    'Noto Sans CJK JP Bold': {
      data: bold,
      family: 'Noto Sans CJK JP',
      weight: 'bold',
    },
  });
}
