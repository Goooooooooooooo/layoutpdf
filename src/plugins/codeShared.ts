import { encodeBase64Asset } from '@/engine/utils/assets.js';

export const HexColorSchemaPattern = /^#[0-9a-fA-F]{6}$/;

interface RasterOptions {
  foreground: string;
  background: string;
  scaleX: number;
  scaleY: number;
  quietZoneX: number;
  quietZoneY: number;
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, character => character.charCodeAt(0));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let first = 1;
  let second = 0;
  for (const byte of bytes) {
    first = (first + byte) % 65521;
    second = (second + first) % 65521;
  }
  return ((second << 16) | first) >>> 0;
}

function storedDeflate(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  for (let offset = 0; offset < bytes.length;) {
    const length = Math.min(0xffff, bytes.length - offset);
    const final = offset + length >= bytes.length;
    blocks.push(Uint8Array.of(
      final ? 1 : 0,
      length & 0xff,
      (length >>> 8) & 0xff,
      (~length) & 0xff,
      ((~length) >>> 8) & 0xff,
    ));
    blocks.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  blocks.push(uint32(adler32(bytes)));
  return concatBytes(blocks);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  return concatBytes([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(concatBytes([typeBytes, data]))),
  ]);
}

function parseHexColor(color: string): Uint8Array {
  if (!HexColorSchemaPattern.test(color)) throw new Error(`Invalid RGB color: ${color}`);
  return Uint8Array.of(
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  );
}

export function monochromeRasterToPngDataUrl(
  matrix: readonly (readonly boolean[])[],
  options: RasterOptions,
): string {
  if (matrix.length === 0 || matrix[0]?.length === 0) throw new Error('Raster matrix cannot be empty.');
  const sourceWidth = matrix[0].length;
  if (matrix.some(row => row.length !== sourceWidth)) throw new Error('Raster matrix rows must have equal widths.');
  const scaleX = Math.max(1, Math.floor(options.scaleX));
  const scaleY = Math.max(1, Math.floor(options.scaleY));
  const quietZoneX = Math.max(0, Math.floor(options.quietZoneX));
  const quietZoneY = Math.max(0, Math.floor(options.quietZoneY));
  const width = (sourceWidth + quietZoneX * 2) * scaleX;
  const height = (matrix.length + quietZoneY * 2) * scaleY;
  const rowBytes = Math.ceil(width / 8);
  const scanlines = new Uint8Array((rowBytes + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    const sourceY = Math.floor(y / scaleY) - quietZoneY;
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(x / scaleX) - quietZoneX;
      const dark = sourceY >= 0
        && sourceY < matrix.length
        && sourceX >= 0
        && sourceX < sourceWidth
        && matrix[sourceY][sourceX];
      if (dark) scanlines[rowOffset + 1 + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
    }
  }

  const ihdr = concatBytes([
    uint32(width),
    uint32(height),
    Uint8Array.of(1, 3, 0, 0, 0),
  ]);
  const palette = concatBytes([
    parseHexColor(options.background),
    parseHexColor(options.foreground),
  ]);
  const png = concatBytes([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', palette),
    pngChunk('IDAT', storedDeflate(scanlines)),
    pngChunk('IEND', new Uint8Array()),
  ]);
  return `data:image/png;base64,${encodeBase64Asset(png)}`;
}
