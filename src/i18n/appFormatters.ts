import { DEFAULT_APP_TIME_ZONE, getCurrentAppLocale, type AppLocale } from '@/i18n/locales.js';

export interface AppDateTimeOptions {
  locale?: AppLocale;
  timeZone?: string;
}

const unsafeFilenameCharacters = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

export const MAX_EXPORT_FILENAME_BYTES = 240;

const utf8Encoder = new TextEncoder();

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (utf8Encoder.encode(value).byteLength <= maxBytes) return value;
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const size = utf8Encoder.encode(character).byteLength;
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function replaceUnsafeFilenameCharacters(value: string): string {
  let result = '';
  let lastWasReplacement = false;
  for (const character of value) {
    const shouldReplace = character.charCodeAt(0) < 32 || unsafeFilenameCharacters.has(character);
    if (shouldReplace) {
      if (!lastWasReplacement) result += '_';
      lastWasReplacement = true;
    } else {
      result += character;
      lastWasReplacement = false;
    }
  }
  return result;
}

export function normalizeSearchText(value: string, locale: AppLocale = getCurrentAppLocale()): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase(locale);
}

export function includesSearchText(
  value: string,
  query: string,
  locale: AppLocale = getCurrentAppLocale(),
): boolean {
  const normalizedQuery = normalizeSearchText(query, locale);
  if (!normalizedQuery) return true;
  return normalizeSearchText(value, locale).includes(normalizedQuery);
}

export function compareLocalizedText(
  left: string,
  right: string,
  locale: AppLocale = getCurrentAppLocale(),
): number {
  return new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  }).compare(left, right);
}

export function compareIsoDateDesc(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
  return right.localeCompare(left);
}

export function formatAppDateTime(
  value: string | number | Date,
  options: AppDateTimeOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(options.locale ?? getCurrentAppLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
    timeZone: options.timeZone ?? DEFAULT_APP_TIME_ZONE,
  }).format(date);
}

export function buildExportFilename(baseName: string, extension: string): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const extensionPattern = new RegExp(`${normalizedExtension.replace('.', '\\.')}$`, 'i');
  const normalizedBaseName = baseName.normalize('NFKC').trim();
  const withoutExtension = normalizedBaseName.replace(extensionPattern, '');
  const safeBaseName = replaceUnsafeFilenameCharacters(withoutExtension)
    .replace(/\s+/g, ' ')
    .trim()
    || 'document';
  const budget = MAX_EXPORT_FILENAME_BYTES - utf8Encoder.encode(normalizedExtension).byteLength;
  const truncatedBaseName = truncateUtf8(safeBaseName, budget).trimEnd() || 'document';
  return `${truncatedBaseName}${normalizedExtension}`;
}
