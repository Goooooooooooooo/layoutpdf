import { useCallback, useMemo, useState } from 'react';

export interface ZoomControllerOptions {
  defaultScale?: number;
  minScale?: number;
  maxScale?: number;
  step?: number;
}

export interface ZoomController {
  scale: number;
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitWidth: (viewportWidthPx: number, contentWidthPx: number, gutterPx?: number) => void;
}

const DEFAULT_MIN_SCALE = 0.25;
const DEFAULT_MAX_SCALE = 2.5;
const DEFAULT_STEP = 0.1;

export function clampZoom(scale: number, minScale = DEFAULT_MIN_SCALE, maxScale = DEFAULT_MAX_SCALE): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(maxScale, Math.max(minScale, scale));
}

export function roundZoom(scale: number): number {
  return Math.round(scale * 100) / 100;
}

export function stepZoom(scale: number, direction: 1 | -1, step = DEFAULT_STEP): number {
  return roundZoom(scale + direction * step);
}

export function getFitWidthZoom(
  viewportWidthPx: number,
  contentWidthPx: number,
  gutterPx = 48,
): number | null {
  if (viewportWidthPx <= gutterPx || contentWidthPx <= 0) return null;
  return roundZoom((viewportWidthPx - gutterPx) / contentWidthPx);
}

export default function useZoomController(options: ZoomControllerOptions = {}): ZoomController {
  const {
    defaultScale = 1,
    minScale = DEFAULT_MIN_SCALE,
    maxScale = DEFAULT_MAX_SCALE,
    step = DEFAULT_STEP,
  } = options;
  const [scale, setRawScale] = useState(() => roundZoom(clampZoom(defaultScale, minScale, maxScale)));

  const setScale = useCallback((nextScale: number) => {
    setRawScale(roundZoom(clampZoom(nextScale, minScale, maxScale)));
  }, [minScale, maxScale]);

  const zoomIn = useCallback(() => {
    setRawScale(prev => roundZoom(clampZoom(stepZoom(prev, 1, step), minScale, maxScale)));
  }, [step, minScale, maxScale]);

  const zoomOut = useCallback(() => {
    setRawScale(prev => roundZoom(clampZoom(stepZoom(prev, -1, step), minScale, maxScale)));
  }, [step, minScale, maxScale]);

  const resetZoom = useCallback(() => {
    setScale(defaultScale);
  }, [defaultScale, setScale]);

  const fitWidth = useCallback((viewportWidthPx: number, contentWidthPx: number, gutterPx?: number) => {
    const nextScale = getFitWidthZoom(viewportWidthPx, contentWidthPx, gutterPx);
    if (nextScale != null) {
      setScale(nextScale);
    }
  }, [setScale]);

  return useMemo(() => ({
    scale,
    percent: Math.round(scale * 100),
    canZoomIn: scale < maxScale,
    canZoomOut: scale > minScale,
    setScale,
    zoomIn,
    zoomOut,
    resetZoom,
    fitWidth,
  }), [scale, maxScale, minScale, setScale, zoomIn, zoomOut, resetZoom, fitWidth]);
}
