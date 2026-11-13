import {
  DEFAULT_DOCUMENT_LOCALE,
  defaultCurrencyAffixes,
  type DateCalendar,
  type DocumentLocale,
} from '@/i18n/locales.js';
import { roundDecimal } from '@/utils/rounding.js';

export type NumberDisplayMode = 'number' | 'currency' | 'calc';

export type NegativeCurrencyStyle =
  | 'minus-after-symbol'
  | 'minus-before-symbol'
  | 'parentheses'
  | 'triangle';

export interface FormatNumberOptions {
  mode?: NumberDisplayMode | 'plain';
  locale?: DocumentLocale;
  prefix?: string;
  suffix?: string;
  decimalPlaces?: number;
  fallback?: 'zero' | 'raw';
  negativeStyle?: NegativeCurrencyStyle;
}

export type DateEra = 'meiji' | 'taisho' | 'showa' | 'heisei' | 'reiwa' | 'seireki';
export type DateDisplayFormat = 'long' | 'short' | 'numeric';

export interface FormatDateOptions {
  locale?: DocumentLocale;
  calendar?: DateCalendar;
  era?: DateEra;
  format?: DateDisplayFormat;
}

const DEFAULT_DECIMAL_PLACES = 0;

interface EraInfo {
  key: Exclude<DateEra, 'seireki'>;
  name: string;
  short: string;
  start: { year: number; month: number; day: number };
}

// Ordered from oldest to newest. Each era owns the dates from its start
// boundary up to the next era's start boundary.
const JAPANESE_ERAS: readonly EraInfo[] = [
  { key: 'meiji', name: '明治', short: 'M', start: { year: 1868, month: 1, day: 25 } },
  { key: 'taisho', name: '大正', short: 'T', start: { year: 1912, month: 7, day: 30 } },
  { key: 'showa', name: '昭和', short: 'S', start: { year: 1926, month: 12, day: 25 } },
  { key: 'heisei', name: '平成', short: 'H', start: { year: 1989, month: 1, day: 8 } },
  { key: 'reiwa', name: '令和', short: 'R', start: { year: 2019, month: 5, day: 1 } },
];

const ERA_MAP = Object.fromEntries(
  JAPANESE_ERAS.map(era => [era.key, era]),
) as Record<EraInfo['key'], EraInfo>;

export function cleanNumericInput(raw: string): string {
  return raw.replace(/[^0-9.-]/g, '');
}

export function parseLooseNumber(value: number | string): number {
  if (typeof value === 'number') return value;
  return Number(value);
}

export function parseCurrencyNumber(value: string): number {
  return parseFloat(cleanNumericInput(value));
}

export function formatLocalizedNumber(
  value: number,
  decimalPlaces = DEFAULT_DECIMAL_PLACES,
  locale: DocumentLocale = DEFAULT_DOCUMENT_LOCALE,
): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

export function formatNumberValue(
  value: number | string,
  options: FormatNumberOptions = {},
): string {
  const {
    mode = 'number',
    locale = DEFAULT_DOCUMENT_LOCALE,
    decimalPlaces = DEFAULT_DECIMAL_PLACES,
    fallback = 'zero',
    negativeStyle = 'minus-after-symbol',
  } = options;
  const currencyAffixes = defaultCurrencyAffixes(locale);
  // In number mode only an explicitly supplied affix belongs to the value;
  // the locale currency symbol must not leak into plain numbers.
  const prefix = options.prefix ?? (mode === 'currency' ? currencyAffixes.prefix : '');
  const suffix = options.suffix ?? (mode === 'currency' ? currencyAffixes.suffix : '');
  const numberValue = parseLooseNumber(value);

  if (!Number.isFinite(numberValue)) {
    return fallback === 'raw' ? String(value) : wrapCurrency('0', prefix, suffix, negativeStyle);
  }

  const formatted = formatLocalizedNumber(
    roundDecimal(numberValue, decimalPlaces),
    decimalPlaces,
    locale,
  );
  return wrapCurrency(formatted, prefix, suffix, negativeStyle);
}

export function formatBooleanValue(
  value: boolean,
  locale: DocumentLocale = DEFAULT_DOCUMENT_LOCALE,
): string {
  if (locale === 'en-US') return value ? 'Yes' : 'No';
  if (locale === 'ja-JP') return value ? 'はい' : 'いいえ';
  return value ? '是' : '否';
}

export function formatCurrencyInput(
  value: string,
  prefix?: string,
  suffix?: string,
  decimalPlaces = DEFAULT_DECIMAL_PLACES,
  locale: DocumentLocale = DEFAULT_DOCUMENT_LOCALE,
): string {
  const affixes = defaultCurrencyAffixes(locale);
  const resolvedPrefix = prefix ?? affixes.prefix;
  const resolvedSuffix = suffix ?? affixes.suffix;
  const numberValue = parseCurrencyNumber(value);
  if (!Number.isFinite(numberValue)) return value || `${resolvedPrefix}0${resolvedSuffix}`;
  return `${resolvedPrefix}${formatLocalizedNumber(
    roundDecimal(numberValue, decimalPlaces),
    decimalPlaces,
    locale,
  )}${resolvedSuffix}`;
}

export function formatDateValue(value: string, options: FormatDateOptions = {}): string {
  if (!value) return '';
  const parsed = parseDateParts(value);
  if (!parsed) return value;

  const {
    locale = DEFAULT_DOCUMENT_LOCALE,
    calendar = 'gregory',
    era = calendar === 'japanese' ? 'reiwa' : 'seireki',
    format = 'long',
  } = options;

  if (era === 'seireki') return formatGregorianDate(parsed, locale, format);

  const actual = eraForDate(parsed);
  if (!actual) return formatGregorianDate(parsed, locale, format);
  const chosen = eraContains(ERA_MAP[era], parsed) ? era : actual;
  return formatJapaneseEraDate(parsed, chosen, format);
}

export function fmtJaDate(value: string, era: string, format: string): string {
  if (!isDateEra(era)) return value;
  const dateFormat = isDateDisplayFormat(format) ? format : 'numeric';
  return formatDateValue(value, {
    locale: 'ja-JP',
    calendar: era === 'seireki' ? 'gregory' : 'japanese',
    era,
    format: dateFormat,
  });
}

function wrapCurrency(
  formatted: string,
  prefix: string,
  suffix: string,
  negativeStyle: NegativeCurrencyStyle,
) {
  if (!prefix && !suffix) return formatted;
  const negative = formatted.startsWith('-');
  const magnitude = negative ? formatted.slice(1) : formatted;
  if (!negative || negativeStyle === 'minus-after-symbol') {
    return `${prefix}${formatted}${suffix}`;
  }
  if (negativeStyle === 'minus-before-symbol') {
    return `-${prefix}${magnitude}${suffix}`;
  }
  if (negativeStyle === 'parentheses') {
    return `(${prefix}${magnitude}${suffix})`;
  }
  return `▲${prefix}${magnitude}${suffix}`;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | undefined {
  const clean = value.replace(/[^0-9/-]/g, '');
  if (!/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) return undefined;
  const parts = clean.split(/[/-]/);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return undefined;
  return { year, month, day };
}

type DateParts = { year: number; month: number; day: number };

function dateOrdinal(date: DateParts): number {
  return date.year * 10_000 + date.month * 100 + date.day;
}

function eraForDate(date: DateParts): Exclude<DateEra, 'seireki'> | undefined {
  const ordinal = dateOrdinal(date);
  for (let index = JAPANESE_ERAS.length - 1; index >= 0; index--) {
    if (ordinal >= dateOrdinal(JAPANESE_ERAS[index].start)) return JAPANESE_ERAS[index].key;
  }
  return undefined;
}

function eraContains(
  era: EraInfo | undefined,
  date: DateParts,
): era is EraInfo {
  if (!era) return false;
  const index = JAPANESE_ERAS.indexOf(era);
  const next = JAPANESE_ERAS[index + 1];
  const ordinal = dateOrdinal(date);
  return ordinal >= dateOrdinal(era.start)
    && (next === undefined || ordinal < dateOrdinal(next.start));
}

function formatJapaneseEraDate(
  date: DateParts,
  era: Exclude<DateEra, 'seireki'>,
  format: DateDisplayFormat,
): string {
  const eraInfo = ERA_MAP[era];
  const eraYear = Math.max(1, date.year - eraInfo.start.year + 1);
  const eraYearText = eraYear === 1 ? '元' : String(eraYear);
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');

  if (format === 'long') return `${eraInfo.name}${eraYearText}年${date.month}月${date.day}日`;
  if (format === 'short') return `${eraInfo.short}${eraYearText}.${month}.${day}`;
  return `${eraInfo.short}${eraYearText}/${month}/${day}`;
}

function formatGregorianDate(
  date: DateParts,
  locale: DocumentLocale,
  format: DateDisplayFormat,
): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');

  if (locale === 'en-US') {
    if (format === 'long') {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
    }
    if (format === 'short') return `${month}/${day}/${date.year}`;
    return `${date.year}-${month}-${day}`;
  }

  if (format === 'long') return `${date.year}年${date.month}月${date.day}日`;
  if (format === 'short') return `${date.year}.${month}.${day}`;
  return `${date.year}/${month}/${day}`;
}

function isDateEra(value: string): value is DateEra {
  return value === 'meiji'
    || value === 'taisho'
    || value === 'showa'
    || value === 'heisei'
    || value === 'reiwa'
    || value === 'seireki';
}

function isDateDisplayFormat(value: string): value is DateDisplayFormat {
  return value === 'long' || value === 'short' || value === 'numeric';
}
