interface HarfBuzzExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_set(input: number, setType: number): number;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_input_get_flags(input: number): number;
  hb_subset_input_set_flags(input: number, flags: number): void;
  hb_set_add(set: number, codepoint: number): void;
  hb_set_clear(set: number): void;
  hb_set_invert(set: number): void;
  hb_blob_create(ptr: number, length: number, mode: number, null1: number, null2: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, lengthPtr: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

let exports: HarfBuzzExports | null = null;
let loadPromise: Promise<void> | null = null;
let wasmLoader: (() => Promise<Uint8Array>) | null = null;

export type SubsetWasmLoader = () => Promise<Uint8Array>;

/**
 * Replaces the default browser wasm loader. Useful for Node, custom asset
 * paths, or bundlers that cannot serve `/fonts/hb-subset.wasm`.
 *
 * Call this before the first subset operation.
 */
export function setSubsetWasmLoader(loader: SubsetWasmLoader | null): void {
  wasmLoader = loader;
  exports = null;
  loadPromise = null;
}

/**
 * `HB_SUBSET_FLAGS_RETAIN_GIDS` (harfbuzz hb_subset_flags_t).
 *
 * PDF export writes CID = glyph id, and CID-keyed CFF readers resolve a CID through
 * the CFF charset. HarfBuzz only keeps that charset identity (`charset[gid] === gid`)
 * when glyph ids are retained; otherwise it preserves the original CIDs as charset
 * values while renumbering glyphs, so most CIDs no longer resolve and strict viewers
 * fall back to .notdef (missing text). Readers that follow `CIDToGIDMap /Identity`
 * directly still render, which hides the defect locally.
 */
const HB_SUBSET_FLAGS_RETAIN_GIDS = 0x2;

async function loadWasm(): Promise<HarfBuzzExports> {
  if (exports) return exports;
  if (!loadPromise) {
    loadPromise = (async () => {
      const bytes = wasmLoader
        ? await wasmLoader()
        : await loadDefaultBrowserWasm();
      const wasmModule = new WebAssembly.Module(new Uint8Array(bytes));
      const wasmInstance = new WebAssembly.Instance(wasmModule, {});
      exports = wasmInstance.exports as unknown as HarfBuzzExports;
    })().catch(error => {
      // Allow a later retry after a transient load failure.
      loadPromise = null;
      throw error;
    });
  }
  await loadPromise;
  return exports!;
}

async function loadDefaultBrowserWasm(): Promise<Uint8Array> {
  if (typeof fetch !== 'function' || typeof location === 'undefined') {
    throw new Error(
      'The HarfBuzz subsetter wasm is not configured. Call setSubsetWasmLoader(), '
      + 'initWithBytes(), or use the Node entry (layoutpdf/pdf/node).',
    );
  }
  const response = await fetch(new URL('/fonts/hb-subset.wasm', location.href));
  if (!response.ok) {
    throw new Error(`Failed to load HarfBuzz subsetter wasm (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function getHeap(HB: HarfBuzzExports): Uint8Array {
  return new Uint8Array(HB.memory.buffer);
}

/** Internal, exported for testing only. */
export async function initWithBytes(bytes: Uint8Array): Promise<void> {
  if (exports) return;
  const wasmModule = new WebAssembly.Module(new Uint8Array(bytes));
  const wasmInstance = new WebAssembly.Instance(wasmModule, {});
  exports = wasmInstance.exports as unknown as HarfBuzzExports;
}

export async function subsetFontBytes(
  fontBytes: Uint8Array,
  codePoints: Set<number>,
): Promise<Uint8Array> {
  const HB = await loadWasm();

  const input = HB.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error('hb_subset_input_create_or_fail returned 0');

  let fontPtr = 0;
  let blob = 0;
  let face = 0;
  let subsetFace = 0;
  let resultBlob = 0;

  try {
    const layoutFeatures = HB.hb_subset_input_set(input, 6);
    HB.hb_set_clear(layoutFeatures);
    HB.hb_set_invert(layoutFeatures);

    HB.hb_subset_input_set_flags(input, HB.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_RETAIN_GIDS);
    if ((HB.hb_subset_input_get_flags(input) & HB_SUBSET_FLAGS_RETAIN_GIDS) === 0) {
      throw new Error('hb_subset_input_set_flags(RETAIN_GIDS) had no effect');
    }

    fontPtr = HB.malloc(fontBytes.byteLength);
    if (fontPtr === 0) throw new Error('malloc failed');
    getHeap(HB).set(fontBytes, fontPtr);

    blob = HB.hb_blob_create(fontPtr, fontBytes.byteLength, 2, 0, 0);
    if (blob === 0) throw new Error('hb_blob_create failed');

    face = HB.hb_face_create(blob, 0);
    if (face === 0) throw new Error('hb_face_create failed');

    const unicodeSet = HB.hb_subset_input_unicode_set(input);
    for (const cp of codePoints) {
      HB.hb_set_add(unicodeSet, cp);
    }

    subsetFace = HB.hb_subset_or_fail(face, input);
    if (subsetFace === 0) throw new Error('hb_subset_or_fail returned 0');

    resultBlob = HB.hb_face_reference_blob(subsetFace);
    const offset = HB.hb_blob_get_data(resultBlob, 0);
    const length = HB.hb_blob_get_length(resultBlob);
    if (length === 0) throw new Error('Empty subset font');

    const heap = getHeap(HB);
    const subsetBytes = new Uint8Array(heap.slice(offset, offset + length));

    if (subsetBytes.length === 0 || subsetBytes.length >= fontBytes.length) {
      throw new Error('Subset font is empty or larger than original');
    }

    return subsetBytes;
  } finally {
    if (resultBlob !== 0) HB.hb_blob_destroy(resultBlob);
    if (subsetFace !== 0) HB.hb_face_destroy(subsetFace);
    if (face !== 0) HB.hb_face_destroy(face);
    if (blob !== 0) HB.hb_blob_destroy(blob);
    if (fontPtr !== 0) HB.free(fontPtr);
    HB.hb_subset_input_destroy(input);
  }
}
