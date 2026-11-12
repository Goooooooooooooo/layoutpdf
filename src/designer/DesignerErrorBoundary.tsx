import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n/index.js';

export interface DesignerErrorBoundaryProps {
  children: ReactNode;
  className?: string;
  onError?(error: Error, info: ErrorInfo): void;
  /** Replaces the default fallback. Receives a reset callback. */
  fallback?(error: Error, reset: () => void): ReactNode;
}

interface DesignerErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in the designer tree so a host page does not go blank.
 * The default fallback shows the message and a retry button.
 */
export class DesignerErrorBoundary extends Component<
  DesignerErrorBoundaryProps,
  DesignerErrorBoundaryState
> {
  state: DesignerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DesignerErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        className={`layoutpdf-designer-error-boundary${this.props.className ? ` ${this.props.className}` : ''}`}
        role="alert"
      >
        <strong>{t('designer.errorBoundaryTitle')}</strong>
        <p>{t('designer.errorBoundaryDescription')}</p>
        <pre>{error.message}</pre>
        <button type="button" onClick={this.reset}>{t('designer.retry')}</button>
      </div>
    );
  }
}
