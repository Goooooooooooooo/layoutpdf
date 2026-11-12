import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Button from '@/ui/button/Button.js';
import Icon, { type IconName } from '@/ui/icon/Icon.js';
import { t } from '@/i18n/index.js';
import {
  ToastContext,
  resolveToastDuration,
  type ToastApi,
  type ToastInput,
  type ToastMessage,
  type ToastTone,
} from './toastContext.js';

const toneIcons: Record<ToastTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  error: 'circle-x',
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss(id: string): void }) {
  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.durationMs, toast.id]);

  return (
    <article
      className={`layoutpdf-toast layoutpdf-toast-${toast.tone}`}
      role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
    >
      <span className="layoutpdf-toast-mark"><Icon name={toneIcons[toast.tone]} /></span>
      <div className="layoutpdf-toast-copy">
        <strong>{toast.title}</strong>
        {toast.description ? <p>{toast.description}</p> : null}
        {toast.action ? (
          <button className="layoutpdf-toast-action" onClick={toast.action.onClick}>
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="compact"
        className="layoutpdf-toast-close"
        aria-label={t('common.closeMessage')}
        onClick={() => onDismiss(toast.id)}
      >
        <Icon name="x" />
      </Button>
    </article>
  );
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastMessage[];
  onDismiss(id: string): void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="layoutpdf-toast-viewport" aria-label={t('common.messageNotifications')} aria-live="polite">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = `toast-${++idRef.current}`;
    const toast: ToastMessage = {
      id,
      tone: input.tone ?? 'info',
      title: input.title,
      description: input.description,
      action: input.action,
      durationMs: resolveToastDuration(input),
    };
    setToasts(current => [...current, toast].slice(-5));
    return id;
  }, []);

  const value = useMemo<ToastApi>(() => ({
    show,
    dismiss,
    info: (title, description, action) => show({ tone: 'info', title, description, action }),
    success: (title, description, action) => show({ tone: 'success', title, description, action }),
    warning: (title, description, action) => show({ tone: 'warning', title, description, action }),
    error: (title, description, action) => show({ tone: 'error', title, description, action }),
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
