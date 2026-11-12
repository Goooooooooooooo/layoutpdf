/**
 * CID-keyed CFF charset inspection.
 *
 * PDF export writes CID = glyph id (`encodeText` emits fontkit glyph ids and the
 * descendant font declares `CIDToGIDMap /Identity`). Readers that resolve a CID
 * through the CFF charset instead of the identity map therefore only render the
 * right glyph when `charset[gid] === gid`. HarfBuzz subsetting without
 * `HB_SUBSET_FLAGS_RETAIN_GIDS` renumbers glyphs while keeping the original CIDs
 * as charset values, breaking that equality and losing text in strict viewers.
 */

export interface CffCharsetInfo {
  hasCff: boolean;
  isCidKeyed: boolean;
  numGlyphs: number;
  /**
   * Whether a CID-keyed charset maps every gid to itself. Non-CFF fonts and
   * name-keyed CFF fonts never consult the CID charset and report `true`.
   */
  cidEqualsGid: boolean;
  cidForGid(gid: number): number | undefined;
}

const NOT_CID: CffCharsetInfo = {
  hasCff: false,
  isCidKeyed: false,
  numGlyphs: 0,
  cidEqualsGid: true,
  cidForGid: () => undefined,
};

const EMPTY_DICT: Uint8Array = new Uint8Array(0);

function readU16(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readTag(buffer: Uint8Array, offset: number): string {
  return String.fromCharCode(buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]);
}

function isSfnt(buffer: Uint8Array): boolean {
  if (buffer.length < 12) return false;
  const tag = readTag(buffer, 0);
  if (tag === 'OTTO' || tag === 'true') return true;
  return buffer[0] === 0 && buffer[1] === 1 && buffer[2] === 0 && buffer[3] === 0;
}

/** Returns the `CFF ` table of an sfnt font, or null for glyf-flavored fonts. */
function extractCffTable(fontBytes: Uint8Array): Uint8Array | null {
  if (!isSfnt(fontBytes)) return null;
  const numTables = readU16(fontBytes, 4);
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > fontBytes.length) return null;
    if (readTag(fontBytes, record) !== 'CFF ') continue;
    const offset = (
      (fontBytes[record + 8] << 24) | (fontBytes[record + 9] << 16)
      | (fontBytes[record + 10] << 8) | fontBytes[record + 11]
    ) >>> 0;
    const length = (
      (fontBytes[record + 12] << 24) | (fontBytes[record + 13] << 16)
      | (fontBytes[record + 14] << 8) | fontBytes[record + 15]
    ) >>> 0;
    if (offset + length > fontBytes.length) return null;
    return fontBytes.slice(offset, offset + length);
  }
  return null;
}

interface CffIndex {
  objects: Uint8Array[];
  end: number;
}

function readIndex(buffer: Uint8Array, position: number): CffIndex {
  const count = readU16(buffer, position);
  if (count === 0) return { objects: [], end: position + 2 };
  const offsetSize = buffer[position + 2];
  const base = position + 3;
  const offsets: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    let value = 0;
    for (let byte = 0; byte < offsetSize; byte += 1) value = value * 256 + buffer[base + index * offsetSize + byte];
    offsets.push(value);
  }
  const dataStart = base + (count + 1) * offsetSize;
  const objects: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = dataStart + offsets[index] - 1;
    const end = dataStart + offsets[index + 1] - 1;
    if (end < start || end > buffer.length) return { objects: [], end: buffer.length };
    objects.push(buffer.slice(start, end));
  }
  return { objects, end: dataStart + offsets[count] - 1 };
}

interface DictEntry {
  op: string;
  args: number[];
}

/** Minimal CFF DICT decoder: enough to reach ROS, charset and CharStrings offsets. */
function parseDict(data: Uint8Array): DictEntry[] {
  const entries: DictEntry[] = [];
  let args: number[] = [];
  let index = 0;
  while (index < data.length) {
    const first = data[index];
    if (first <= 21) {
      if (first === 12) {
        entries.push({ op: `12 ${data[index + 1]}`, args });
        index += 2;
      } else {
        entries.push({ op: String(first), args });
        index += 1;
      }
      args = [];
    } else if (first === 28) {
      args.push(readU16(data, index + 1));
      index += 3;
    } else if (first === 29) {
      args.push(
        ((data[index + 1] << 24) | (data[index + 2] << 16) | (data[index + 3] << 8) | data[index + 4]) | 0,
      );
      index += 5;
    } else if (first === 30) {
      index += 1;
      let text = '';
      let done = false;
      while (!done && index < data.length) {
        const byte = data[index];
        index += 1;
        for (const nibble of [byte >> 4, byte & 0x0f]) {
          if (nibble === 0x0f) {
            done = true;
            break;
          }
          text += nibble === 0x0a ? '.' : nibble === 0x0b ? '-' : nibble === 0x0c ? 'E' : String(nibble);
        }
      }
      args.push(Number.parseFloat(text) || 0);
    } else if (first >= 32 && first <= 246) {
      args.push(first - 139);
      index += 1;
    } else if (first >= 247 && first <= 250) {
      args.push((first - 247) * 256 + data[index + 1] + 108);
      index += 2;
    } else if (first >= 251 && first <= 254) {
      args.push(-(first - 251) * 256 - data[index + 1] - 108);
      index += 2;
    } else {
      index += 1;
    }
  }
  return entries;
}

/** Reads the charset into a gid-indexed array; returns null for predefined charsets. */
function readCharset(cff: Uint8Array, offset: number, numGlyphs: number): Uint32Array | null {
  if (offset < 0 || offset >= cff.length) return null;
  const values = new Uint32Array(numGlyphs);
  const format = cff[offset];
  let position = offset + 1;
  let gid = 1;
  if (format === 0) {
    for (; gid < numGlyphs; gid += 1) {
      if (position + 1 >= cff.length) return null;
      values[gid] = readU16(cff, position);
      position += 2;
    }
  } else if (format === 1 || format === 2) {
    while (gid < numGlyphs) {
      if (position + 1 >= cff.length) return null;
      const first = readU16(cff, position);
      position += 2;
      const left = format === 1 ? cff[position] : readU16(cff, position);
      position += format === 1 ? 1 : 2;
      for (let step = 0; step <= left && gid < numGlyphs; step += 1, gid += 1) {
        values[gid] = first + step;
      }
    }
  } else {
    return null;
  }
  return values;
}

export function inspectCffCharset(fontBytes: Uint8Array): CffCharsetInfo {
  const cff = extractCffTable(fontBytes);
  if (!cff || cff.length < 4) return NOT_CID;

  const nameIndex = readIndex(cff, cff[2]);
  const topIndex = readIndex(cff, nameIndex.end);
  const topDict = parseDict(topIndex.objects[0] ?? EMPTY_DICT);
  const operandOf = (op: string): number | undefined => {
    const entry = topDict.find(item => item.op === op && item.args.length > 0);
    return entry ? entry.args[entry.args.length - 1] : undefined;
  };

  const isCidKeyed = topDict.some(item => item.op === '12 30');
  const charStringsOffset = operandOf('17');
  if (charStringsOffset == null || charStringsOffset + 1 >= cff.length) {
    throw new Error('CFF CharStrings offset is missing or out of range');
  }
  const numGlyphs = readU16(cff, charStringsOffset);

  if (!isCidKeyed) {
    return {
      hasCff: true,
      isCidKeyed: false,
      numGlyphs,
      cidEqualsGid: true,
      cidForGid: () => undefined,
    };
  }

  const charsetOffset = operandOf('15');
  if (charsetOffset == null) throw new Error('CID-keyed CFF is missing its charset offset');
  const values = readCharset(cff, charsetOffset, numGlyphs);
  if (!values) throw new Error('Unsupported or truncated CFF charset');

  let cidEqualsGid = true;
  for (let gid = 1; gid < numGlyphs; gid += 1) {
    if (values[gid] !== gid) {
      cidEqualsGid = false;
      break;
    }
  }
  return {
    hasCff: true,
    isCidKeyed: true,
    numGlyphs,
    cidEqualsGid,
    cidForGid: gid => (gid >= 0 && gid < values.length ? values[gid] : undefined),
  };
}

export function assertCffCharsetIdentity(fontBytes: Uint8Array, label: string): void {
  const info = inspectCffCharset(fontBytes);
  if (info.cidEqualsGid) return;
  const mismatches: string[] = [];
  for (let gid = 1; gid < info.numGlyphs && mismatches.length < 5; gid += 1) {
    if (info.cidForGid(gid) !== gid) mismatches.push(`gid ${gid} -> cid ${info.cidForGid(gid)}`);
  }
  throw new Error(
    `Font "${label}" keeps original CIDs in its CID-keyed CFF charset `
    + `(${mismatches.join(', ')}), but PDF export writes CID = glyph id. `
    + 'Strict viewers would drop that text; subset with retained glyph ids instead.',
  );
}
