import type { AnyLayoutPDFPlugin } from '@/engine/core/plugin.js';
import { calcPlugin } from '@/plugins/calc/calc.js';
import { gridPlugin } from '@/plugins/grid/grid.js';
import { summaryPlugin } from '@/plugins/summary/summary.js';
import { tablePlugin } from '@/plugins/table/table.js';

export {
  calcPlugin,
  gridPlugin,
  summaryPlugin,
  tablePlugin,
};

/**
 * Business-oriented plugins. Kept out of the default engine so lean consumers
 * do not pay for table/grid/summary code unless they need it.
 */
export const businessPlugins: readonly AnyLayoutPDFPlugin[] = [
  tablePlugin,
  gridPlugin,
  summaryPlugin,
  calcPlugin,
];
