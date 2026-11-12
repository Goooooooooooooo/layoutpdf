export type AppLocale = 'zh-CN' | 'ja-JP' | 'en-US';

export type DocumentLocale = 'ja-JP' | 'zh-CN' | 'en-US';

export type DateCalendar = 'gregory' | 'japanese';

export interface FormatLocaleSettings {
  locale: DocumentLocale;
  currency: string;
  calendar: DateCalendar;
  timeZone: string;
}

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN';
export const DEFAULT_APP_TIME_ZONE = 'Asia/Tokyo';
export const DEFAULT_DOCUMENT_LOCALE: DocumentLocale = 'ja-JP';
export const SUPPORTED_APP_LOCALES: readonly AppLocale[] = ['zh-CN', 'ja-JP', 'en-US'];

let currentAppLocale: AppLocale = DEFAULT_APP_LOCALE;

const appLocaleListeners = new Set<() => void>();

export const DEFAULT_FORMAT_LOCALE_SETTINGS: FormatLocaleSettings = {
  locale: DEFAULT_DOCUMENT_LOCALE,
  currency: 'JPY',
  calendar: 'gregory',
  timeZone: 'Asia/Tokyo',
};

export function defaultFormatSettingsForLocale(
  locale: DocumentLocale = DEFAULT_DOCUMENT_LOCALE,
): FormatLocaleSettings {
  if (locale === 'en-US') {
    return {
      locale,
      currency: 'USD',
      calendar: 'gregory',
      timeZone: 'America/New_York',
    };
  }

  if (locale === 'zh-CN') {
    return {
      locale,
      currency: 'CNY',
      calendar: 'gregory',
      timeZone: 'Asia/Shanghai',
    };
  }

  return { ...DEFAULT_FORMAT_LOCALE_SETTINGS };
}

export function parseDocumentLocale(value: string | undefined): DocumentLocale {
  if (value === 'ja-JP' || value === 'zh-CN' || value === 'en-US') return value;
  return DEFAULT_DOCUMENT_LOCALE;
}

export function parseAppLocale(value: string | null | undefined): AppLocale {
  if (value === 'ja-JP' || value === 'zh-CN' || value === 'en-US') return value;
  return DEFAULT_APP_LOCALE;
}

export function getCurrentAppLocale(): AppLocale {
  return currentAppLocale;
}

export function setCurrentAppLocale(locale: AppLocale): void {
  if (currentAppLocale === locale) return;
  currentAppLocale = locale;
  for (const listener of [...appLocaleListeners]) listener();
}

/** Subscribes to application locale changes. Useful with `useSyncExternalStore`. */
export function subscribeAppLocale(listener: () => void): () => void {
  appLocaleListeners.add(listener);
  return () => {
    appLocaleListeners.delete(listener);
  };
}

export function formatSettingsFromLanguage(value: string | undefined): FormatLocaleSettings {
  return defaultFormatSettingsForLocale(parseDocumentLocale(value));
}

/**
 * Resolves the effective document format settings.
 *
 * When `override.locale` changes the language, defaults for that locale are
 * used as the base, then any explicitly provided fields win.
 */
export function resolveFormatLocaleSettings(
  language: string | undefined,
  override?: Partial<FormatLocaleSettings>,
): FormatLocaleSettings {
  const base = formatSettingsFromLanguage(language);
  if (!override) return base;

  const locale = override.locale ?? base.locale;
  const baseForLocale = locale === base.locale
    ? base
    : defaultFormatSettingsForLocale(locale);

  return {
    locale,
    currency: override.currency ?? baseForLocale.currency,
    calendar: override.calendar ?? baseForLocale.calendar,
    timeZone: override.timeZone ?? baseForLocale.timeZone,
  };
}

export function formulaErrorText(locale: DocumentLocale): string {
  if (locale === 'en-US') return '#Formula Error';
  if (locale === 'zh-CN') return '#公式错误';
  return '#数式エラー';
}

export function defaultCurrencyAffixes(locale: DocumentLocale = DEFAULT_DOCUMENT_LOCALE): {
  prefix: string;
  suffix: string;
} {
  const settings = defaultFormatSettingsForLocale(locale);
  if (settings.currency === 'USD') return { prefix: '$', suffix: '' };
  if (settings.currency === 'CNY') return { prefix: '¥', suffix: '' };
  return { prefix: '¥', suffix: '' };
}
