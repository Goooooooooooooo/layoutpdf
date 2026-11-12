export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function expandShortHex(hex: string): string {
  if (hex.length === 3) {
    return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  if (hex.length === 4 && hex[0] === '#') {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

export function hex2Rgb(hex?: string): RgbColor {
  if (!hex) return { r: 0, g: 0, b: 0 };
  const n = parseInt(expandShortHex(hex.replace('#', '')), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
