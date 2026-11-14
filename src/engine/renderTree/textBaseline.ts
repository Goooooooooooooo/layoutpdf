import type { FontVerticalMetrics } from '@/engine/pdf/font/fontManager.js';
import { mmToPdfPt } from '@/engine/utils/units.js';

/**
 * Typical Latin metrics used when the active font manager cannot expose real
 * ascent/descent values (for example lightweight test stubs).
 */
const FALLBACK_METRICS: FontVerticalMetrics = { ascent: 0.8, descent: 0.2 };

/**
 * Distance in PDF points from the top of a measured text line to its glyph
 * baseline. Mirrors the CSS inline formatting model: half-leading distributes
 * the extra line height above and below the font's ascent + descent box.
 */
export function textBaselineFromLineTopPt(
  fontSizePt: number,
  lineHeightMm: number,
  metrics: FontVerticalMetrics | undefined,
): number {
  const { ascent, descent } = metrics ?? FALLBACK_METRICS;
  const lineHeightPt = mmToPdfPt(lineHeightMm);
  const emBoxPt = (ascent + descent) * fontSizePt;
  const halfLeadingPt = (lineHeightPt - emBoxPt) / 2;
  return halfLeadingPt + ascent * fontSizePt;
}
