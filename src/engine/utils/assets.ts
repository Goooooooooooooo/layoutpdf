import type { TemplateAsset } from '@/engine/core/document.js';

function normalizeBase64(data: string, label: string): string {
  const normalized = data.replace(/\s+/g, '');
  if (
    normalized.length === 0
    || normalized.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error(`${label} contains invalid base64 data.`);
  }
  return normalized;
}

function normalizedBase64ByteLength(normalized: string): number {
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return normalized.length / 4 * 3 - padding;
}

function getGlobalBuffer() {
  return (globalThis as unknown as {
    Buffer?: { from(input: string, encoding: string): Uint8Array };
  }).Buffer;
}

export function decodeBase64Asset(asset: TemplateAsset): Uint8Array {
  const normalized = normalizeBase64(asset.data, `Asset "${asset.name}"`);
  const BufferCtor = getGlobalBuffer();
  if (BufferCtor) return new Uint8Array(BufferCtor.from(normalized, 'base64'));
  const binary = atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function getBase64AssetByteLength(asset: TemplateAsset): number {
  return normalizedBase64ByteLength(normalizeBase64(asset.data, `Asset "${asset.name}"`));
}

export function getImageDataUrlByteLength(dataUrl: string): number {
  const match = /^data:image\/(?:png|jpeg);base64,(.+)$/is.exec(dataUrl);
  if (!match) throw new Error('Inline image must be a PNG or JPEG base64 data URL.');
  return normalizedBase64ByteLength(normalizeBase64(match[1], 'Inline image'));
}

export function encodeBase64Asset(bytes: Uint8Array): string {
  const BufferCtor = getGlobalBuffer();
  if (BufferCtor) {
    return (BufferCtor as unknown as {
      from(input: Uint8Array): { toString(encoding: string): string };
    }).from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
