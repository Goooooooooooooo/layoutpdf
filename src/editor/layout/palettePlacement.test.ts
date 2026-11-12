import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankTemplateFile, type TemplateElement } from '@/engine/core/document.js';
import { findAvailablePosition } from '@/editor/layout/palettePlacement.js';

function element(id: string, x: number, y: number, width: number, height: number): TemplateElement<object> {
  return {
    id,
    type: 'rect',
    name: id,
    box: { x, y, width, height },
    rotate: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    value: null,
    props: {},
  };
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function pageWith(elements: TemplateElement<object>[]) {
  const file = createBlankTemplateFile();
  const page = file.template.pages[0];
  page.elements.push(...elements);
  return page;
}

test('findAvailablePosition', async t => {
  await t.test('ignores the x/y of a full element box passed as the size', () => {
    const page = pageWith([
      element('header', 18, 16, 60, 10),
      element('customer', 18, 28, 80, 12),
    ]);
    // Palette calls this with the whole default box, including its x/y.
    const position = findAvailablePosition(page, { x: 10, y: 10, width: 80, height: 12 });
    assert.notDeepEqual(position, { x: 10, y: 10 });
    assert.equal(
      page.elements.some(item => overlaps({ ...position, width: 80, height: 12 }, item.box)),
      false,
    );
  });

  await t.test('keeps each successive placement clear of the previous one', () => {
    const page = pageWith([element('header', 18, 16, 60, 10)]);
    const sizes = [
      { width: 80, height: 12 },
      { width: 50, height: 10 },
      { width: 45, height: 10 },
      { width: 60, height: 20 },
    ];
    for (const size of sizes) {
      const position = findAvailablePosition(page, { x: 10, y: 10, ...size });
      assert.equal(
        page.elements.some(item => overlaps({ ...position, ...size }, item.box)),
        false,
        `placed ${JSON.stringify(size)} on top of an existing element at ${JSON.stringify(position)}`,
      );
      page.elements.push(element(`added-${page.elements.length}`, position.x, position.y, size.width, size.height));
    }
  });

  await t.test('places elements inside the page padding', () => {
    const page = pageWith([element('header', 18, 16, 60, 10)]);
    const position = findAvailablePosition(page, { width: 30, height: 10 });
    assert.ok(position.x >= page.padding[3]);
    assert.ok(position.y >= page.padding[0]);
    assert.ok(position.x + 30 <= page.size.width - page.padding[1]);
    assert.ok(position.y + 10 <= page.size.height - page.padding[2]);
  });

  await t.test('falls back to the padding origin when nothing fits', () => {
    const page = pageWith([element('full', 0, 0, 210, 297)]);
    assert.deepEqual(findAvailablePosition(page, { width: 80, height: 12 }), {
      x: page.padding[3],
      y: page.padding[0],
    });
  });
});
