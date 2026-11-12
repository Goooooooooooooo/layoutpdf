import type { DocumentMode } from '@/editor/state/documentState.js';
import { t } from '@/i18n/index.js';
import ZoomControls from '@/editor/components/ZoomControls.js';

interface FloatingToolbarProps {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitWidth: () => void;
  showGrid: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  mode: DocumentMode;
  onTogglePreview: () => void;
}

export default function FloatingToolbar({
  percent,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
  onFitWidth,
  showGrid,
  snapEnabled,
  onToggleGrid,
  onToggleSnap,
  mode,
  onTogglePreview,
}: FloatingToolbarProps) {
  return (
    <div className="layoutpdf-floating-toolbar" role="toolbar" aria-label={t('editor.canvas.toolbarAria')}>
      <ZoomControls
        percent={percent}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onReset={onReset}
        onFitWidth={onFitWidth}
      />
      {mode === 'designer' ? (
        <div className="layoutpdf-canvas-options">
          <button
            type="button"
            className={showGrid ? 'active' : ''}
            aria-pressed={showGrid}
            title={t('editor.canvas.grid.title')}
            onClick={onToggleGrid}
          >
            {t('editor.canvas.grid')}
          </button>
          <button
            type="button"
            className={snapEnabled ? 'active' : ''}
            aria-pressed={snapEnabled}
            title={t('editor.canvas.snap.title')}
            onClick={onToggleSnap}
          >
            {t('editor.canvas.snap')}
          </button>
        </div>
      ) : null}
      <div className="layoutpdf-canvas-options">
        <button
          type="button"
          className={mode === 'preview' ? 'active' : ''}
          aria-pressed={mode === 'preview'}
          title={mode === 'preview'
            ? t('editor.canvas.exitPreview.title')
            : t('editor.canvas.preview.title')}
          onClick={onTogglePreview}
        >
          {mode === 'preview'
            ? t('editor.canvas.exitPreview')
            : t('editor.canvas.preview')}
        </button>
      </div>
    </div>
  );
}
