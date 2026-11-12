import type { ElementBox, TemplateElement } from '@/engine/core/document.js';

export interface DesignerPoint {
  x: number;
  y: number;
}

export interface DesignerSize {
  width: number;
  height: number;
}

export function clampPointToPage(point: DesignerPoint, pageSize: DesignerSize): DesignerPoint {
  return {
    x: Math.max(0, Math.min(pageSize.width, point.x)),
    y: Math.max(0, Math.min(pageSize.height, point.y)),
  };
}

export function createMarqueeBox(
  start: DesignerPoint,
  end: DesignerPoint,
  pageSize: DesignerSize,
): ElementBox {
  const boundedStart = clampPointToPage(start, pageSize);
  const boundedEnd = clampPointToPage(end, pageSize);
  return {
    x: Math.min(boundedStart.x, boundedEnd.x),
    y: Math.min(boundedStart.y, boundedEnd.y),
    width: Math.abs(boundedEnd.x - boundedStart.x),
    height: Math.abs(boundedEnd.y - boundedStart.y),
  };
}

function boxesIntersect(left: ElementBox, right: ElementBox): boolean {
  if (left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return false;
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

export function selectElementIdsInBox(
  elements: TemplateElement<object>[],
  box: ElementBox,
): string[] {
  return elements
    .filter(element => !element.hidden && boxesIntersect(element.box, box))
    .map(element => element.id);
}

export function mergeSelectionIds(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

export function snapMm(value: number, step = 0.5): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function moveBoxes(
  boxes: Record<string, ElementBox>,
  delta: { x: number; y: number },
  pageSize?: { width: number; height: number },
  snapStep = 0.5,
): Record<string, ElementBox> {
  const entries = Object.entries(boxes);
  if (entries.length === 0) return {};
  const values = entries.map(([, box]) => box);
  const minX = Math.min(...values.map(box => box.x));
  const minY = Math.min(...values.map(box => box.y));
  const maxX = Math.max(...values.map(box => box.x + box.width));
  const maxY = Math.max(...values.map(box => box.y + box.height));
  const desiredX = snapStep > 0 ? snapMm(minX + delta.x, snapStep) - minX : delta.x;
  const desiredY = snapStep > 0 ? snapMm(minY + delta.y, snapStep) - minY : delta.y;
  const maxDeltaX = pageSize ? pageSize.width - maxX : Infinity;
  const maxDeltaY = pageSize ? pageSize.height - maxY : Infinity;
  const constrainedX = maxDeltaX < -minX
    ? -minX
    : Math.max(-minX, Math.min(maxDeltaX, desiredX));
  const constrainedY = maxDeltaY < -minY
    ? -minY
    : Math.max(-minY, Math.min(maxDeltaY, desiredY));
  return Object.fromEntries(entries.map(([id, box]) => [id, {
    ...box,
    x: box.x + constrainedX,
    y: box.y + constrainedY,
  }]));
}

export interface SnapGuides {
  x?: number;
  y?: number;
}

function boxAnchors(box: ElementBox, axis: 'x' | 'y'): number[] {
  const start = box[axis];
  const size = axis === 'x' ? box.width : box.height;
  return [start, start + size / 2, start + size];
}

function closestSnapDelta(
  moving: ElementBox[],
  stationary: ElementBox[],
  axis: 'x' | 'y',
  boundaryGuides: number[],
  threshold: number,
): { delta: number; guide?: number } {
  const targets = [
    ...boundaryGuides,
    ...stationary.flatMap(box => boxAnchors(box, axis)),
  ];
  let best = { delta: 0, distance: threshold + 1, guide: undefined as number | undefined };
  for (const anchor of moving.flatMap(box => boxAnchors(box, axis))) {
    for (const target of targets) {
      const delta = target - anchor;
      const distance = Math.abs(delta);
      if (distance <= threshold && distance < best.distance) {
        best = { delta, distance, guide: target };
      }
    }
  }
  return { delta: best.delta, guide: best.guide };
}

export function snapBoxesToGuides(
  boxes: Record<string, ElementBox>,
  stationary: ElementBox[],
  page: { size: { width: number; height: number }; padding: [number, number, number, number] },
  threshold = 1.5,
): { boxes: Record<string, ElementBox>; guides: SnapGuides } {
  const moving = Object.values(boxes);
  if (moving.length === 0) return { boxes, guides: {} };
  const [top, right, bottom, left] = page.padding;
  const horizontal = closestSnapDelta(
    moving,
    stationary,
    'x',
    [left, page.size.width - right],
    threshold,
  );
  const vertical = closestSnapDelta(
    moving,
    stationary,
    'y',
    [top, page.size.height - bottom],
    threshold,
  );
  const shifted = Object.fromEntries(Object.entries(boxes).map(([id, box]) => [id, {
    ...box,
    x: box.x + horizontal.delta,
    y: box.y + vertical.delta,
  }]));
  const bounded = moveBoxes(shifted, { x: 0, y: 0 }, page.size, 0);
  const constrainedX = Object.keys(shifted).some(id => bounded[id].x !== shifted[id].x);
  const constrainedY = Object.keys(shifted).some(id => bounded[id].y !== shifted[id].y);
  return {
    boxes: bounded,
    guides: {
      x: constrainedX ? undefined : horizontal.guide,
      y: constrainedY ? undefined : vertical.guide,
    },
  };
}

export type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 'n' | 's';

export function resizeBox(
  box: ElementBox,
  handle: ResizeHandle,
  delta: { x: number; y: number },
  pageSize: { width: number; height: number },
  snapStep = 0.5,
): ElementBox {
  const pw = pageSize.width;
  const ph = pageSize.height;
  let { x, y, width: w, height: h } = box;

  switch (handle) {
    case 'se':
      w += delta.x;
      h += delta.y;
      break;
    case 'sw':
      x += delta.x;
      w -= delta.x;
      h += delta.y;
      break;
    case 'ne':
      y += delta.y;
      w += delta.x;
      h -= delta.y;
      break;
    case 'nw':
      x += delta.x;
      y += delta.y;
      w -= delta.x;
      h -= delta.y;
      break;
    case 'e':
      w += delta.x;
      break;
    case 'w':
      x += delta.x;
      w -= delta.x;
      break;
    case 'n':
      y += delta.y;
      h -= delta.y;
      break;
    case 's':
      h += delta.y;
      break;
  }

  // Clamp position first — size bounds depend on position
  if (handle === 'nw' || handle === 'sw' || handle === 'w') {
    x = Math.max(0, Math.min(x, box.x + box.width - 1));
  }
  if (handle === 'nw' || handle === 'ne' || handle === 'n') {
    y = Math.max(0, Math.min(y, box.y + box.height - 1));
  }

  // Clamp size
  if (handle === 'ne' || handle === 'e' || handle === 'se') {
    w = Math.min(w, pw - box.x);
  }
  if (handle === 'sw' || handle === 'w' || handle === 'nw') {
    w = Math.min(w, pw - x);
  }
  if (handle === 'ne' || handle === 'n' || handle === 'nw') {
    h = Math.min(h, ph - y);
  }
  if (handle === 'se' || handle === 's' || handle === 'sw') {
    h = Math.min(h, ph - box.y);
  }
  w = Math.max(1, w);
  h = Math.max(1, h);

  return {
    x: snapMm(x, snapStep),
    y: snapMm(y, snapStep),
    width: snapMm(w, snapStep),
    height: snapMm(h, snapStep),
  };
}
