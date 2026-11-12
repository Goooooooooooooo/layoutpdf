import { createContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastMessage extends Required<Pick<ToastInput, 'tone' | 'title' | 'durationMs'>> {
  id: string;
  description?: string;
  action?: ToastAction;
}

export interface ToastApi {
  show(input: ToastInput): string;
  dismiss(id: string): void;
  info(title: string, description?: string, action?: ToastAction): string;
  success(title: string, description?: string, action?: ToastAction): string;
  warning(title: string, description?: string, action?: ToastAction): string;
  error(title: string, description?: string, action?: ToastAction): string;
}

export const DEFAULT_TOAST_DURATION_MS = 4_500;
export const ERROR_TOAST_DURATION_MS = 7_000;

export function resolveToastDuration(input: ToastInput): number {
  return input.durationMs ?? (input.tone === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);
}

export const ToastContext = createContext<ToastApi | null>(null);
