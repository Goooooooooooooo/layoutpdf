import type { DocumentMode } from '@/editor/state/documentState.js';

export const PROPERTIES_PANEL_MIN_WIDTH = 300;
export const PROPERTIES_PANEL_MAX_WIDTH = 480;
export const PROPERTIES_PANEL_DEFAULT_WIDTH = 336;

export function clampPropertiesPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PROPERTIES_PANEL_DEFAULT_WIDTH;
  return Math.min(PROPERTIES_PANEL_MAX_WIDTH, Math.max(PROPERTIES_PANEL_MIN_WIDTH, Math.round(width)));
}

export const PALETTE_PANEL_MIN_WIDTH = 180;
export const PALETTE_PANEL_MAX_WIDTH = 360;
export const PALETTE_PANEL_DEFAULT_WIDTH = 220;

export function clampPalettePanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PALETTE_PANEL_DEFAULT_WIDTH;
  return Math.min(PALETTE_PANEL_MAX_WIDTH, Math.max(PALETTE_PANEL_MIN_WIDTH, Math.round(width)));
}

export function workspaceClassName(mode: DocumentMode): string {
  return `layoutpdf-workspace${mode === 'designer' ? '' : ' view-mode'}`;
}
