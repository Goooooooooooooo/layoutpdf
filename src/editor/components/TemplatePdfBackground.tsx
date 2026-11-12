import { useEffect, useRef, useState } from 'react';
import type { TemplateAsset } from '@/engine/core/document.js';
import { t } from '@/i18n/index.js';
import {
  acquirePdfCanvasDocument,
  renderPdfPageToCanvas,
} from '@/editor/utils/pdfCanvasRenderer.js';

export interface TemplatePdfBackgroundProps {
  asset: TemplateAsset;
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  onReady?: (error?: Error) => void;
}

export default function TemplatePdfBackground({
  asset,
  pageIndex,
  widthPx,
  heightPx,
  onReady,
}: TemplatePdfBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const documentHandle = acquirePdfCanvasDocument(asset);
    setError(false);
    (async () => {
      try {
        if (asset.kind !== 'pdf') throw new Error('Background asset is not a PDF.');
        const canvas = canvasRef.current;
        if (!canvas) return;
        await renderPdfPageToCanvas(
          documentHandle.document,
          pageIndex,
          canvas,
          widthPx,
          heightPx,
          controller.signal,
        );
        if (!cancelled) onReady?.();
      } catch (renderError) {
        if (!cancelled) {
          setError(true);
          onReady?.(renderError instanceof Error ? renderError : new Error(String(renderError)));
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      documentHandle.release();
    };
  }, [asset, pageIndex, widthPx, heightPx, onReady]);

  return (
    <>
      <canvas ref={canvasRef} className="layoutpdf-page-background" />
      {error ? <div className="layoutpdf-background-error">{t('editor.canvas.pdfBackgroundReadFailed')}</div> : null}
    </>
  );
}
