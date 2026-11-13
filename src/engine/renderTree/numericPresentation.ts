import type { JsonValue } from '@/engine/core/document.js';
import type { NumericDisplayFormat } from '@/engine/renderTree/model.js';
import { formatNumberValue } from '@/i18n/formatters.js';
import type { FormatLocaleSettings } from '@/i18n/locales.js';
import { roundDecimal } from '@/utils/rounding.js';

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
  const effectivePlaces = numericFormat?.decimalPlaces ?? decimalPlaces;
  // Round before the zero branch so 0.004 at two decimals is treated as zero
  // and never renders as "-0".
  const rounded = Number.isFinite(parsed) ? roundDecimal(parsed, effectivePlaces) : parsed;
  if (Number.isFinite(rounded) && rounded === 0 && numericFormat?.zeroDisplay !== 'zero') {
    return { text: numericFormat?.zeroDisplay === 'dash' ? '-' : '' };
  }
  if (!numericFormat && legacyCurrency) {
    return {
      text: formatNumberValue(primitive, {
        mode: 'currency',
        locale: format.locale,
        decimalPlaces: effectivePlaces,
        fallback: 'raw',
      }),
    };
  }
  if (numericFormat?.prefix && numericFormat.symbolLayout === 'attached') {
    return {
      text: formatNumberValue(primitive, {
        mode: 'currency',
        locale: format.locale,
        prefix: numericFormat.prefix,
        suffix: '',
        decimalPlaces: effectivePlaces,
        fallback: 'raw',
        negativeStyle: numericFormat.negativeStyle,
      }),
    };
  }
  const text = formatNumberValue(primitive, {
    mode: 'number',
    locale: format.locale,
    decimalPlaces: effectivePlaces,
    fallback: 'raw',
  });
  if (!numericFormat?.prefix) return { text };
  if (numericFormat.symbolLayout !== 'edge') return { text: `${numericFormat.prefix}${text}` };

  const style = numericFormat.negativeStyle;
  if (text.startsWith('-') && style && style !== 'minus-after-symbol') {
    const magnitude = text.slice(1);
    if (style === 'minus-before-symbol') {
      return { text: magnitude, prefixText: `-${numericFormat.prefix}` };
    }
    if (style === 'parentheses') {
      return { text: `${magnitude})`, prefixText: `(${numericFormat.prefix}` };
    }
    return { text: magnitude, prefixText: `▲${numericFormat.prefix}` };
  }
  return { text, prefixText: numericFormat.prefix };
}
