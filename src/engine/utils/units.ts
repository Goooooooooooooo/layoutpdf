export const MM_TO_PT = 72 / 25.4;
export const MM_TO_CSS_PX = 96 / 25.4;
export const PT_TO_CSS_PX = 96 / 72;

export function mmToPdfPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function pdfPtToMm(pt: number): number {
  return pt / MM_TO_PT;
}

export function mmToCssPx(mm: number, zoom = 1): number {
  return mm * MM_TO_CSS_PX * zoom;
}

export function ptToCssPx(pt: number, zoom = 1): number {
  return pt * PT_TO_CSS_PX * zoom;
}

export function cssPxToMm(px: number, zoom = 1): number {
  if (zoom <= 0) throw new Error('Zoom must be greater than zero');
  return px / MM_TO_CSS_PX / zoom;
}
