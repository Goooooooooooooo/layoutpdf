import type { CSSProperties } from 'react';

/**
 * Designer theme tokens. Keys must be `--layoutpdf-*` CSS variables; the `layoutpdf-` prefix
 * is added automatically when omitted.
 *
 * ```ts
 * const theme = {
 *   '--layoutpdf-color-primary': '#2563eb',
 *   '--layoutpdf-color-primary-hover': '#1d4ed8',
 *   '--layoutpdf-color-workspace': '#f8fafc',
 * };
 * ```
 */
export type DesignerTheme = Record<string, string | undefined>;

export function resolveDesignerTheme(theme: DesignerTheme | undefined): CSSProperties | undefined {
  if (!theme) return undefined;
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    if (!value) continue;
    style[key.startsWith('--') ? key : `--layoutpdf-${key.replace(/^layoutpdf-/, '')}`] = value;
  }
  return Object.keys(style).length > 0 ? style as CSSProperties : undefined;
}
