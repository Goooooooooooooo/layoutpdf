import type { LayoutPDFFont } from '@/engine/utils/fontTypes.js';

export interface CreatePdfFontFromBytesOptions {
  family?: string;
  weight?: 'normal' | 'bold';
  fallback?: boolean;
  subset?: boolean;
}

/**
 * Builds a `LayoutPDFFont` record from raw OTF/TTF bytes. Useful for Node,
 * tests, and hosts that load fonts themselves instead of fetching the bundled
 * Noto files.
 */
export function createPdfFontFromBytes(
  bytes: Uint8Array,
  name: string,
  options: CreatePdfFontFromBytesOptions = {},
): LayoutPDFFont {
  return {
    [name]: {
      data: bytes,
      family: options.family ?? name,
      weight: options.weight ?? 'normal',
      fallback: options.fallback ?? true,
      subset: options.subset,
    },
  };
}
