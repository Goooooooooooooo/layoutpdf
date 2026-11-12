import type { ElementBox, TemplateElement } from '@/engine/core/document.js';

export type Alignment = 'left' | 'right' | 'top' | 'bottom' | 'horizontalCenter' | 'verticalCenter';
export type DistributionAxis = 'horizontal' | 'vertical';
export type SizeDimension = 'width' | 'height';

function boxesEqual(left: ElementBox, right: ElementBox): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function changedBoxEntries(
  elements: TemplateElement<object>[],
  boxes: Map<string, ElementBox>,
): Record<string, ElementBox> {
  return Object.fromEntries(elements.flatMap(element => {
    const box = boxes.get(element.id);
    return box && !boxesEqual(element.box, box) ? [[element.id, box]] : [];
  }));
}

export function alignElementBoxes(
  elements: TemplateElement<object>[],
  alignment: Alignment,
): Record<string, ElementBox> {
  if (elements.length < 2) return {};
  const left = Math.min(...elements.map(element => element.box.x));
  const right = Math.max(...elements.map(element => element.box.x + element.box.width));
  const top = Math.min(...elements.map(element => element.box.y));
  const bottom = Math.max(...elements.map(element => element.box.y + element.box.height));
  const horizontalCenter = (left + right) / 2;
  const verticalCenter = (top + bottom) / 2;

  return Object.fromEntries(elements.map(element => {
    const box = { ...element.box };
    if (alignment === 'left') box.x = left;
    if (alignment === 'right') box.x = right - box.width;
    if (alignment === 'top') box.y = top;
    if (alignment === 'bottom') box.y = bottom - box.height;
    if (alignment === 'horizontalCenter') box.x = horizontalCenter - box.width / 2;
    if (alignment === 'verticalCenter') box.y = verticalCenter - box.height / 2;
    return [element.id, box];
  }));
}

export function distributeElementBoxes(
  elements: TemplateElement<object>[],
  axis: DistributionAxis,
): Record<string, ElementBox> {
  const movable = elements.filter(element => !element.locked);
  if (movable.length < 3) return {};
  const position = axis === 'horizontal' ? 'x' : 'y';
  const size = axis === 'horizontal' ? 'width' : 'height';
  const sorted = [...movable].sort((left, right) =>
    left.box[position] - right.box[position] || left.id.localeCompare(right.id)
  );
  const start = sorted[0].box[position];
  const end = sorted.at(-1)!.box[position] + sorted.at(-1)!.box[size];
  const occupied = sorted.reduce((total, element) => total + element.box[size], 0);
  const gap = (end - start - occupied) / (sorted.length - 1);
  const boxes = new Map<string, ElementBox>();
  let cursor = start;
  sorted.forEach((element, index) => {
    const box = { ...element.box, [position]: index === sorted.length - 1
      ? end - element.box[size]
      : cursor };
    boxes.set(element.id, box);
    cursor = box[position] + box[size] + gap;
  });
  return changedBoxEntries(movable, boxes);
}

export function matchElementBoxSizes(
  elements: TemplateElement<object>[],
  dimension: SizeDimension,
  referenceId = elements.at(-1)?.id,
): Record<string, ElementBox> {
  if (elements.length < 2) return {};
  const reference = elements.find(element => element.id === referenceId) ?? elements.at(-1);
  if (!reference) return {};
  const boxes = new Map(elements
    .filter(element => !element.locked)
    .map(element => [element.id, { ...element.box, [dimension]: reference.box[dimension] }])
  );
  return changedBoxEntries(elements, boxes);
}
