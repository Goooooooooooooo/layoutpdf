import { fontkit } from '@/engine/pdf/font/fontkitRuntime.js';

export function assertValidFontBytes(data: Uint8Array): void {
  fontkit.create(data);
}

