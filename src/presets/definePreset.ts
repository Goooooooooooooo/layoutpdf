import type { ElementPreset } from '@/presets/types.js';

/** Identity helper that preserves preset type inference at the call site. */
export function definePreset<TPreset extends ElementPreset>(preset: TPreset): TPreset {
  return preset;
}
