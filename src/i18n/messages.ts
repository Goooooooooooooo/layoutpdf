import { getCurrentAppLocale, type AppLocale } from '@/i18n/locales.js';
import { zhCNMessages, type MessageCatalog } from '@/i18n/messages.zh-CN.js';

export type MessageKey = keyof typeof zhCNMessages;

export type MessageValue = string | number | boolean | null | undefined;

export type MessageValues = Readonly<Record<string, MessageValue>>;

const messageCatalogs: Partial<Record<AppLocale, Partial<MessageCatalog>>> = {
  'zh-CN': zhCNMessages,
};

let catalogsPromise: Promise<void> | null = null;

export function ensureCatalogs(): Promise<void> {
  if (catalogsPromise) return catalogsPromise;
  catalogsPromise = (async () => {
    const [jaJP, enUS] = await Promise.all([
      import('@/i18n/messages.ja-JP.js'),
      import('@/i18n/messages.en-US.js'),
    ]);
    messageCatalogs['ja-JP'] = jaJP.jaJPMessages;
    messageCatalogs['en-US'] = enUS.enUSMessages;
  })();
  return catalogsPromise;
}

// Preload non-default catalogs in the next microtask so the initial render
// is not blocked, but the catalogs are available before the user switches locale.
if (typeof queueMicrotask === 'function') {
  queueMicrotask(() => { void ensureCatalogs(); });
}

export function formatMessage(template: string, values: MessageValues = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? placeholder : String(value);
  });
}

export function t(
  key: MessageKey,
  values?: MessageValues,
  locale: AppLocale = getCurrentAppLocale(),
): string {
  return formatMessage((messageCatalogs[locale] ?? zhCNMessages)[key] ?? zhCNMessages[key], values);
}
