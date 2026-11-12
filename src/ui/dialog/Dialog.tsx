import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/ui/button/Button.js';
import { t } from '@/i18n/index.js';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const openDialogStack: HTMLElement[] = [];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(element => (
      !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ));
}

function focusWithoutScrolling(element: HTMLElement): void {
  element.focus({ preventScroll: true });
}

export interface DialogProps {
  open: boolean;
  title: string;
  className?: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  isDismissible?: boolean;
  onClose(): void;
}

export function Dialog({
  open,
  title,
  className,
  description,
  children,
  actions,
  isDismissible = true,
  onClose,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const isDismissibleRef = useRef(isDismissible);
  onCloseRef.current = onClose;
  isDismissibleRef.current = isDismissible;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogStack.push(dialog);
    const isTopDialog = () => openDialogStack.at(-1) === dialog;
    const focusInitialControl = () => {
      const focusable = getFocusableElements(dialog);
      const preferred = focusable.find(element => element.hasAttribute('data-dialog-initial-focus'));
      focusWithoutScrolling(preferred ?? dialog);
    };
    focusInitialControl();

    const onFocusIn = (event: FocusEvent) => {
      // Nested dialogs share document-level listeners; only the top dialog may reclaim focus.
      if (!isTopDialog() || !(event.target instanceof Node) || dialog.contains(event.target)) return;
      focusInitialControl();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (isDismissibleRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        focusWithoutScrolling(dialog);
        return;
      }
      const activeElement = document.activeElement;
      const currentIndex = focusable.findIndex(element => element === activeElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
        : currentIndex === -1 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
      event.preventDefault();
      focusWithoutScrolling(focusable[nextIndex]);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown, true);
      const stackIndex = openDialogStack.lastIndexOf(dialog);
      if (stackIndex >= 0) openDialogStack.splice(stackIndex, 1);
      if (previousFocus?.isConnected) focusWithoutScrolling(previousFocus);
    };
  }, [open]);

  useEffect(() => {
    if (open && !isDismissible && dialogRef.current) {
      focusWithoutScrolling(dialogRef.current);
    }
  }, [isDismissible, open]);

  if (!open) return null;
  const dialog = (
    <div
      className="layoutpdf-dialog-backdrop"
      onMouseDown={event => {
        if (isDismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={['layoutpdf-dialog', className].filter(Boolean).join(' ')}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={event => event.stopPropagation()}
      >
        <header className="layoutpdf-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <Button
            variant="ghost"
            size="compact"
            aria-label={t('common.closeDialog')}
            disabled={!isDismissible}
            onClick={onClose}
          >
            ×
          </Button>
        </header>
        {description ? <p id={descriptionId} className="layoutpdf-dialog-description">{description}</p> : null}
        {children ? <div className="layoutpdf-dialog-content">{children}</div> : null}
        {actions ? <footer className="layoutpdf-dialog-actions">{actions}</footer> : null}
      </section>
    </div>
  );
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  isWorking?: boolean;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  isWorking = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      isDismissible={!isWorking}
      onClose={onClose}
      actions={(
        <>
          <Button data-dialog-initial-focus disabled={isWorking} onClick={onClose}>{cancelLabel ?? t('common.cancel')}</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            isBusy={isWorking}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      )}
    />
  );
}

export interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  value: string;
  description?: string;
  confirmLabel?: string;
  isWorking?: boolean;
  onValueChange(value: string): void;
  onConfirm(): void;
  onClose(): void;
}

export function PromptDialog({
  open,
  title,
  label,
  value,
  description,
  confirmLabel,
  isWorking = false,
  onValueChange,
  onConfirm,
  onClose,
}: PromptDialogProps) {
  const trimmedValue = value.trim();
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      isDismissible={!isWorking}
      onClose={onClose}
      actions={(
        <>
          <Button disabled={isWorking} onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            isBusy={isWorking}
            disabled={!trimmedValue}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.save')}
          </Button>
        </>
      )}
    >
      <label className="layoutpdf-dialog-field">
        <span>{label}</span>
        <input
          data-dialog-initial-focus
          autoFocus
          value={value}
          disabled={isWorking}
          onChange={event => onValueChange(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && trimmedValue && !isWorking) onConfirm();
          }}
        />
      </label>
    </Dialog>
  );
}
