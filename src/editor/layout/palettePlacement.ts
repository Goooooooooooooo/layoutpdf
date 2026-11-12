import type { ElementBox, TemplatePage } from '@/engine/core/document.js';

function overlaps(left: ElementBox, right: ElementBox, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

export function findAvailablePosition(
  page: TemplatePage,
  size: Pick<ElementBox, 'width' | 'height'>,
  step = 5,
): { x: number; y: number } {
  const [top, right, bottom, left] = page.padding;
  const width = size.width;
  const height = size.height;
  const maxX = Math.max(left, page.size.width - right - width);
  const maxY = Math.max(top, page.size.height - bottom - height);
  for (let y = top; y <= maxY; y += step) {
    for (let x = left; x <= maxX; x += step) {
      // Use width/height explicitly: callers pass a full element box, and
      // spreading it here would overwrite the candidate x/y with the box's
      // original position, so every search would collapse to the fallback.
      const candidate = { x, y, width, height };
      if (page.elements.every(element => !overlaps(candidate, element.box, 2))) return { x, y };
    }
  }
  return { x: left, y: top };
}
