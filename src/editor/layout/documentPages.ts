export interface PageViewportBounds {
  sourcePageId: string;
  top: number;
  bottom: number;
}

export function getViewportSourcePageId(
  pages: PageViewportBounds[],
  focusY: number,
): string | undefined {
  let nearest: PageViewportBounds | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const page of pages) {
    if (page.top <= focusY && page.bottom >= focusY) return page.sourcePageId;
    const distance = focusY < page.top ? page.top - focusY : focusY - page.bottom;
    if (distance < nearestDistance) {
      nearest = page;
      nearestDistance = distance;
    }
  }

  return nearest?.sourcePageId;
}
