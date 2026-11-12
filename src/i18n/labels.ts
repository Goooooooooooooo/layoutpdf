import { t, type MessageKey } from '@/i18n/messages.js';
import { zhCNMessages } from '@/i18n/messages.zh-CN.js';

export interface MessageLabel {
  label: string;
  labelKey?: string;
}

export function resolveMessageLabel(item: MessageLabel): string {
  return item.labelKey && Object.hasOwn(zhCNMessages, item.labelKey)
    ? t(item.labelKey as MessageKey)
    : item.label;
}
