import type { JsonValue } from '@/engine/core/document.js';
import type { NumericDisplayFormat } from '@/engine/renderTree/model.js';
import { formatNumberValue } from '@/i18n/formatters.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';

export interface NumericPresentation {
  text: string;
  prefixText?: string;
}

export function formatNumericPresentation(
  value: JsonValue | undefined,
  numericFormat: NumericDisplayFormat | undefined,
  decimalPlaces: number,
  format: FormatLocaleSettings,
  legacyCurrency = false,
): NumericPresentation {
  if (value === undefined || value === null || value === '') {
    return { text: numericFormat?.emptyDisplay === 'dash' ? '-' : '' };
  }
  if (Array.isArray(value) || typeof value === 'object') {
    throw new Error('Numeric presentation value must be primitive.');
  }
  const primitive = typeof value === 'boolean' ? Number(value) : value;
  const parsed = typeof primitive === 'number' ? primitive : Number(primitive);
  if (Number.isFinite(parsed) && parsed === 0 && numericFormat?.zeroDisplay !== 'zero') {
    return { text: numericFormat?.zeroDisplay === 'dash' ? '-' : '' };
  }
  if (!numericFormat && legacyCurrency) {
    return {
      text: formatNumberValue(primitive, {
        mode: 'currency',
        locale: format.locale,
        decimalPlaces,
        fallback: 'raw',
      }),
    };
  }
  const text = formatNumberValue(primitive, {
    mode: 'number',
    locale: format.locale,
    decimalPlaces,
    fallback: 'raw',
  });
  if (!numericFormat?.prefix) return { text };
  return numericFormat.symbolLayout === 'edge'
    ? { text, prefixText: numericFormat.prefix }
    : { text: `${numericFormat.prefix}${text}` };
}
