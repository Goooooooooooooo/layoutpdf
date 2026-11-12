import type { ElementBox } from '@/engine/core/document.js';

export function rotateChildBox(
  box: ElementBox,
  parentBox: ElementBox,
  rotate: number,
): ElementBox {
  if (rotate === 0) return box;

  const radians = (rotate * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const parentCenterX = parentBox.x + parentBox.width / 2;
  const parentCenterY = parentBox.y + parentBox.height / 2;
  const childCenterX = box.x + box.width / 2;
  const childCenterY = box.y + box.height / 2;
  const offsetX = childCenterX - parentCenterX;
  const offsetY = childCenterY - parentCenterY;

  return {
    x: parentCenterX + offsetX * cosine - offsetY * sine - box.width / 2,
    y: parentCenterY + offsetX * sine + offsetY * cosine - box.height / 2,
    width: box.width,
    height: box.height,
  };
}
