import {
  DEFAULT_DOCUMENT_LOCALE,
  defaultCurrencyAffixes,
  type DateCalendar,
  type DocumentLocale,
} from '@/i18n/locales.js';

export type NumberDisplayMode = 'number' | 'currency' | 'calc';

export interface FormatNumberOptions {
  mode?: NumberDisplayMode | 'plain';
  locale?: DocumentLocale;
  prefix?: string;
  suffix?: string;
  decimalPlaces?: number;
  fallback?: 'zero' | 'raw';
}

export type DateEra = 'reiwa' | 'heisei' | 'seireki';
export type DateDisplayFormat = 'long' | 'short' | 'numeric';

export interface FormatDateOptions {
  locale?: DocumentLocale;
  calendar?: DateCalendar;
  era?: DateEra;
  format?: DateDisplayFormat;
  timeZone?: string;
}

const DEFAULT_DECIMAL_PLACES = 0;

const ERA_MAP: Record<Exclude<DateEra, 'seireki'>, { start: number; name: string; short: string }> = {
  reiwa: { start: 2019, name: '令和', short: 'R' },
  heisei: { start: 1989, name: '平成', short: 'H' },
};

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
  } = options;
  const currencyAffixes = defaultCurrencyAffixes(locale);
  const prefix = options.prefix ?? currencyAffixes.prefix;
  const suffix = options.suffix ?? currencyAffixes.suffix;
  const numberValue = parseLooseNumber(value);

  if (!Number.isFinite(numberValue)) {
    return fallback === 'raw' ? String(value) : wrapCurrency('0', mode, prefix, suffix);
  }

  const formatted = formatLocalizedNumber(numberValue, decimalPlaces, locale);
  return wrapCurrency(formatted, mode, prefix, suffix);
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
  return `${resolvedPrefix}${formatLocalizedNumber(numberValue, decimalPlaces, locale)}${resolvedSuffix}`;
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
    timeZone = 'UTC',
  } = options;

  if (calendar === 'japanese' || era !== 'seireki') {
    return formatJapaneseEraDate(parsed, era === 'seireki' ? 'reiwa' : era, format);
  }

  return formatGregorianDate(parsed, locale, format, timeZone);
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
  mode: FormatNumberOptions['mode'],
  prefix: string,
  suffix: string,
) {
  return mode === 'currency' ? `${prefix}${formatted}${suffix}` : formatted;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | undefined {
  const clean = value.replace(/[^0-9/-]/g, '');
  if (!/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) return undefined;
  const parts = clean.split(/[/-]/);
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { year, month, day };
}

function formatJapaneseEraDate(
  date: { year: number; month: number; day: number },
  era: Exclude<DateEra, 'seireki'>,
  format: DateDisplayFormat,
): string {
  const eraInfo = ERA_MAP[era];
  const eraYear = date.year - eraInfo.start + 1;
  const eraYearText = eraYear === 1 ? '元' : String(eraYear);
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');

  if (format === 'long') return `${eraInfo.name}${eraYearText}年${date.month}月${date.day}日`;
  if (format === 'short') return `${eraInfo.short}${eraYearText}.${month}.${day}`;
  return `${eraInfo.short}${eraYearText}/${month}/${day}`;
}

function formatGregorianDate(
  date: { year: number; month: number; day: number },
  locale: DocumentLocale,
  format: DateDisplayFormat,
  _timeZone: string,
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
  return value === 'reiwa' || value === 'heisei' || value === 'seireki';
}

function isDateDisplayFormat(value: string): value is DateDisplayFormat {
  return value === 'long' || value === 'short' || value === 'numeric';
}
