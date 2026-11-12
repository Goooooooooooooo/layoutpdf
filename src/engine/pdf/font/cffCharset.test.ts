import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { assertCffCharsetIdentity, inspectCffCharset } from './cffCharset.js';

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** 5-byte integer operand (DICT op 29) keeps the top dict a fixed width. */
function int32(value: number): number[] {
  return [29, ...u32(value)];
}

function index1(objects: number[][]): number[] {
  const offsets = [1];
  for (const object of objects) offsets.push(offsets[offsets.length - 1] + object.length);
  return [...u16(objects.length), 1, ...offsets, ...objects.flat()];
}

function charsetBytes(
  format: 0 | 1 | 2,
  numGlyphs: number,
  cidForGid: (gid: number) => number,
): number[] {
  if (format === 0) {
    const bytes = [0];
    for (let gid = 1; gid < numGlyphs; gid += 1) bytes.push(...u16(cidForGid(gid)));
    return bytes;
  }
  const bytes: number[] = [format];
  let gid = 1;
  while (gid < numGlyphs) {
    const first = cidForGid(gid);
    let nLeft = 0;
    let next = gid + 1;
    while (next < numGlyphs && cidForGid(next) === first + (next - gid)) {
      nLeft += 1;
      next += 1;
    }
    bytes.push(...u16(first));
    if (format === 1) bytes.push(nLeft);
    else bytes.push(...u16(nLeft));
    gid = next;
  }
  return bytes;
}

function wrapInOtto(cff: number[]): Uint8Array {
  const offset = 12 + 16;
  const font = new Uint8Array(offset + cff.length);
  font.set(
    [
      79, 84, 84, 79, // OTTO
      0, 1, // numTables
      0, 16, 0, 0, 0, 0, // searchRange / entrySelector / rangeShift
      67, 70, 70, 32, // CFF table record
      0, 0, 0, 0, // checksum
      ...u32(offset),
      ...u32(cff.length),
    ],
    0,
  );
  font.set(cff, offset);
  return font;
}

interface BuildOptions {
  cidKeyed: boolean;
  numGlyphs: number;
  format?: 0 | 1 | 2;
  cidForGid?: (gid: number) => number;
}

/** Minimal OTTO + CFF fixture: enough structure for charset inspection. */
function buildCffSfnt(options: BuildOptions): Uint8Array {
  const { cidKeyed, numGlyphs, format = 0, cidForGid = gid => gid } = options;
  const header = [1, 0, 4, 4];
  const nameIndex = index1([[84, 101, 115, 116]]);
  const stringIndex = [0, 0];
  const gsubrIndex = [0, 0];
  const ros = cidKeyed ? [...int32(391), ...int32(394), ...int32(0), 12, 30] : [];
  const topDictLength = ros.length + 6 + 6;
  const topIndexLength = 5 + topDictLength;
  const charsetOffset = header.length
    + nameIndex.length
    + topIndexLength
    + stringIndex.length
    + gsubrIndex.length;
  const charset = charsetBytes(format, numGlyphs, cidForGid);
  const charstringsOffset = charsetOffset + charset.length;
  const topDict = [...ros, ...int32(charsetOffset), 15, ...int32(charstringsOffset), 17];
  assert.equal(topDict.length, topDictLength, 'top dict must keep its assumed size');
  const charstrings = index1(Array.from({ length: numGlyphs }, () => [14]));
  return wrapInOtto([
    ...header,
    ...nameIndex,
    ...index1([topDict]),
    ...stringIndex,
    ...gsubrIndex,
    ...charset,
    ...charstrings,
  ]);
}

describe('cffCharset', () => {
  it('reports the shipped CID-keyed Noto CJK font as identity', async () => {
    const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSansCJKjp-Regular.otf'));
    const info = inspectCffCharset(fontBytes);
    assert.equal(info.hasCff, true);
    assert.equal(info.isCidKeyed, true);
    assert.ok(info.numGlyphs > 60000, `numGlyphs ${info.numGlyphs}`);
    assert.equal(info.cidEqualsGid, true);
    assert.equal(info.cidForGid(1), 1);
    assert.doesNotThrow(() => assertCffCharsetIdentity(fontBytes, 'NotoSansCJKjp-Regular'));
  });

  it('treats inputs without a CFF table as not applicable', async () => {
    const emptyOtto = new Uint8Array(12);
    emptyOtto.set([79, 84, 84, 79]); // OTTO with numTables = 0
    for (const fontBytes of [emptyOtto, new TextEncoder().encode('not a font')]) {
      const info = inspectCffCharset(fontBytes);
      assert.equal(info.hasCff, false);
      assert.equal(info.cidEqualsGid, true);
      assert.equal(info.cidForGid(3), undefined);
      assert.doesNotThrow(() => assertCffCharsetIdentity(fontBytes, 'non-CFF'));
    }
  });

  it('skips CID checks for name-keyed CFF fonts', () => {
    const info = inspectCffCharset(buildCffSfnt({ cidKeyed: false, numGlyphs: 4 }));
    assert.equal(info.hasCff, true);
    assert.equal(info.isCidKeyed, false);
    assert.equal(info.numGlyphs, 4);
    assert.equal(info.cidEqualsGid, true);
    assert.doesNotThrow(() => assertCffCharsetIdentity(buildCffSfnt({ cidKeyed: false, numGlyphs: 4 }), 'name-keyed'));
  });

  it('accepts identity charsets in formats 0, 1 and 2', () => {
    for (const format of [0, 1, 2] as const) {
      const fontBytes = buildCffSfnt({ cidKeyed: true, numGlyphs: 6, format });
      const info = inspectCffCharset(fontBytes);
      assert.equal(info.hasCff, true, `format ${format}`);
      assert.equal(info.isCidKeyed, true, `format ${format}`);
      assert.equal(info.numGlyphs, 6, `format ${format}`);
      assert.equal(info.cidEqualsGid, true, `format ${format}`);
      assert.equal(info.cidForGid(5), 5, `format ${format}`);
      assert.doesNotThrow(() => assertCffCharsetIdentity(fontBytes, `format-${format}`));
    }
  });

  it('rejects a CID-keyed charset that keeps original CIDs after renumbering', () => {
    const fontBytes = buildCffSfnt({
      cidKeyed: true,
      numGlyphs: 5,
      cidForGid: gid => gid + 100,
    });
    const info = inspectCffCharset(fontBytes);
    assert.equal(info.isCidKeyed, true);
    assert.equal(info.cidEqualsGid, false);
    assert.equal(info.cidForGid(1), 101);
    assert.throws(
      () => assertCffCharsetIdentity(fontBytes, 'subset'),
      /Font "subset" keeps original CIDs/,
    );
  });
});
