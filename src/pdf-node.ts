import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import {
  createFontManager,
  type FontManagerOptions,
  type PdfFontManager,
} from '@/engine/pdf/font/fontManager.js';
import {
  setSubsetWasmLoader,
  type SubsetWasmLoader,
} from '@/engine/pdf/font/subsetFont.js';
import type {
  AnyLayoutPDFPlugin,
  PluginRegistry,
} from '@/engine/core/plugin.js';
import type { LayoutPDFFont } from '@/engine/utils/fontTypes.js';
import {
  createEngine,
  type CreateEngineOptions,
  type DocumentEngine,
} from '@/engine/createEngine.js';
import { plugins as defaultPlugins } from '@/plugins/index.js';

export interface NodeFontSource {
  /** Logical name used by templates and the font manager. */
  name: string;
  /** Binary OTF/TTF path. Ignored when `bytes` is provided. */
  path?: string | URL;
  /** Raw OTF/TTF bytes. */
  bytes?: Uint8Array | ArrayBuffer;
  family?: string;
  weight?: 'normal' | 'bold';
  fallback?: boolean;
  subset?: boolean;
}

async function toBytes(value: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function toPath(path: string | URL): string {
  return path instanceof URL ? fileURLToPath(path) : path;
}

async function readFontSource(source: NodeFontSource): Promise<LayoutPDFFont> {
  let data: Uint8Array;
  if (source.bytes) {
    data = await toBytes(source.bytes);
  } else if (source.path) {
    data = new Uint8Array(await readFile(toPath(source.path)));
  } else {
    throw new Error(`Font "${source.name}" needs either bytes or a path.`);
  }

  return {
    [source.name]: {
      data,
      family: source.family ?? source.name,
      weight: source.weight ?? 'normal',
      fallback: source.fallback,
      subset: source.subset,
    },
  };
}

/**
 * Builds a `PdfFontManager` from font files or byte arrays. Node has no
 * browser font registry, so every font must be supplied explicitly.
 */
export async function createNodeFontManager(
  sources: readonly NodeFontSource[],
  options: FontManagerOptions = {},
): Promise<PdfFontManager> {
  const fonts: LayoutPDFFont = {};
  for (const source of sources) {
    Object.assign(fonts, await readFontSource(source));
  }
  if (Object.keys(fonts).length === 0) {
    throw new Error('At least one font source is required.');
  }
  return createFontManager(fonts, options);
}

export interface CreateDefaultNodeFontManagerOptions {
  regularPath: string | URL;
  boldPath?: string | URL;
  family?: string;
}

/**
 * Builds the regular/bold pair used by the bundled browser defaults.
 */
export async function createDefaultNodeFontManager(
  options: CreateDefaultNodeFontManagerOptions,
): Promise<PdfFontManager> {
  const family = options.family ?? 'Noto Sans CJK JP';
  const sources: NodeFontSource[] = [
    {
      name: `${family} Regular`,
      path: options.regularPath,
      family,
      weight: 'normal',
      fallback: true,
    },
  ];
  if (options.boldPath) {
    sources.push({
      name: `${family} Bold`,
      path: options.boldPath,
      family,
      weight: 'bold',
    });
  }
  return createNodeFontManager(sources);
}

export function resolveBundledNodeFontPath(
  fileName = 'NotoSansCJKjp-Regular.otf',
): string | undefined {
  const here = packageDirectory();
  return [
    // Built package: dist/fonts/*
    resolvePath(here, 'fonts', fileName),
    // Source checkout: public/fonts/*
    resolvePath(here, '../public/fonts', fileName),
    resolvePath(process.cwd(), 'public/fonts', fileName),
    resolvePath(process.cwd(), 'node_modules/layoutpdf/dist/fonts', fileName),
  ].find(candidate => existsSync(candidate));
}

export interface NodeFontSubsetOptions {
  /** Path to `hb-subset.wasm`. Defaults to the copy shipped in `dist/fonts`. */
  wasmPath?: string | URL;
  /** Raw wasm bytes, taking precedence over `wasmPath`. */
  wasmBytes?: Uint8Array;
}

function packageDirectory(): string {
  // Use `fileURLToPath(import.meta.url)` directly so Vite does not rewrite it
  // as an asset URL during the library build.
  return dirname(fileURLToPath(import.meta.url));
}

function defaultWasmCandidates(): string[] {
  const here = packageDirectory();
  return [
    // Built package: dist/pdf-node.js -> dist/fonts/hb-subset.wasm
    resolvePath(here, 'fonts/hb-subset.wasm'),
    // Source checkout: src/pdf-node.ts -> public/fonts/hb-subset.wasm
    resolvePath(here, '../public/fonts/hb-subset.wasm'),
    resolvePath(process.cwd(), 'public/fonts/hb-subset.wasm'),
    resolvePath(process.cwd(), 'node_modules/layoutpdf/dist/fonts/hb-subset.wasm'),
  ];
}

export function resolveDefaultNodeSubsetWasmPath(): string | undefined {
  return defaultWasmCandidates().find(candidate => existsSync(candidate));
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enables HarfBuzz font subsetting for Node exports. Returns `false` when no
 * wasm file could be found, so callers can fall back to full-font embedding.
 */
export async function configureNodeFontSubsetting(
  options: NodeFontSubsetOptions = {},
): Promise<boolean> {
  if (options.wasmBytes) {
    const bytes = options.wasmBytes;
    setSubsetWasmLoader(async () => bytes);
    return true;
  }

  const path = options.wasmPath
    ? toPath(options.wasmPath)
    : resolveDefaultNodeSubsetWasmPath();

  if (!path) return false;
  if (!await readable(path)) {
    if (options.wasmPath) {
      throw new Error(`Font subsetter wasm is not readable: ${path}`);
    }
    return false;
  }

  const loader: SubsetWasmLoader = async () =>
    new Uint8Array(await readFile(path));
  setSubsetWasmLoader(loader);
  return true;
}

export interface CreateNodeEngineOptions
  extends Omit<CreateEngineOptions, 'fontManager' | 'plugins'> {
  /** Prebuilt font manager. Takes precedence over font options. */
  fontManager?: PdfFontManager;
  /** Explicit font sources. */
  fonts?: readonly NodeFontSource[];
  /** Convenience single regular font. */
  fontPath?: string | URL;
  /** Optional bold companion for `fontPath`. */
  boldFontPath?: string | URL;
  /** Family name used with `fontPath` / `boldFontPath`. */
  familyName?: string;
  plugins?: PluginRegistry | readonly AnyLayoutPDFPlugin[];
  /**
   * HarfBuzz subsetting for smaller PDFs. Defaults to `true`; silently falls
   * back to full-font embedding when the wasm file cannot be located.
   */
  fontSubsetting?: boolean | NodeFontSubsetOptions;
}

async function resolveNodeFontManager(
  options: CreateNodeEngineOptions,
): Promise<PdfFontManager> {
  if (options.fontManager) return options.fontManager;
  if (options.fonts && options.fonts.length > 0) {
    return createNodeFontManager(options.fonts);
  }
  if (options.fontPath) {
    return createDefaultNodeFontManager({
      regularPath: options.fontPath,
      boldPath: options.boldFontPath,
      family: options.familyName,
    });
  }

  const bundledRegular = resolveBundledNodeFontPath();
  if (bundledRegular) {
    return createDefaultNodeFontManager({
      regularPath: bundledRegular,
      boldPath: resolveBundledNodeFontPath('NotoSansCJKjp-Bold.otf'),
    });
  }

  throw new Error(
    'createNodeEngine requires fontPath, fonts, or fontManager. '
    + 'The bundled Noto CJK fonts could not be found; pass a font file path.',
  );
}

/**
 * Node/headless engine factory. Unlike `createDefaultEngine`, it never fetches
 * fonts or wasm over HTTP.
 */
export async function createNodeEngine(
  options: CreateNodeEngineOptions = {},
): Promise<DocumentEngine> {
  const {
    fontManager,
    fonts,
    fontPath,
    boldFontPath,
    familyName,
    plugins,
    fontSubsetting,
    ...engineOptions
  } = options;

  const manager = await resolveNodeFontManager(options);

  if (fontSubsetting !== false) {
    const subsetOptions = typeof fontSubsetting === 'object'
      ? fontSubsetting
      : {};
    await configureNodeFontSubsetting(subsetOptions);
  }

  return createEngine({
    ...engineOptions,
    fontManager: manager,
    plugins: plugins ?? defaultPlugins,
  });
}

export { setSubsetWasmLoader };
export type { SubsetWasmLoader };
