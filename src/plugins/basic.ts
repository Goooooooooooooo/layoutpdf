import type { AnyLayoutPDFPlugin } from '@/engine/core/plugin.js';
import { barcodePlugin } from '@/plugins/barcode/barcode.js';
import { checkboxPlugin } from '@/plugins/checkbox/checkbox.js';
import { currencyPlugin } from '@/plugins/currency/currency.js';
import { datePlugin } from '@/plugins/date/date.js';
import { ellipsePlugin } from '@/plugins/ellipse/ellipse.js';
import { imagePlugin } from '@/plugins/image/image.js';
import { labelPlugin } from '@/plugins/label/label.js';
import { linePlugin } from '@/plugins/line/line.js';
import { numberPlugin } from '@/plugins/number/number.js';
import { qrcodePlugin } from '@/plugins/qrcode/qrcode.js';
import { radioGroupPlugin } from '@/plugins/radioGroup/radioGroup.js';
import { rectPlugin } from '@/plugins/rect/rect.js';
import { selectPlugin } from '@/plugins/select/select.js';
import { textPlugin } from '@/plugins/text/text.js';

export {
  barcodePlugin,
  checkboxPlugin,
  currencyPlugin,
  datePlugin,
  ellipsePlugin,
  imagePlugin,
  labelPlugin,
  linePlugin,
  numberPlugin,
  qrcodePlugin,
  radioGroupPlugin,
  rectPlugin,
  selectPlugin,
  textPlugin,
};

/** Batteries-included plugins that do not require business-specific logic. */
export const basicPlugins: readonly AnyLayoutPDFPlugin[] = [
  labelPlugin,
  textPlugin,
  numberPlugin,
  currencyPlugin,
  datePlugin,
  selectPlugin,
  radioGroupPlugin,
  checkboxPlugin,
  linePlugin,
  rectPlugin,
  ellipsePlugin,
  imagePlugin,
  qrcodePlugin,
  barcodePlugin,
];
