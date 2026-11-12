import type { CSSProperties } from 'react';
import Icon, { type IconName } from '@/ui/icon/Icon.js';

type ZoomLabel = 'zoom.out' | 'zoom.in' | 'zoom.fitWidth' | 'zoom.reset' | 'zoom.percent';
type ZoomI18n = (key: ZoomLabel) => string;

const ZOOM_LABELS: Record<ZoomLabel, string> = {
  'zoom.out': '缩小',
  'zoom.in': '放大',
  'zoom.fitWidth': '适应宽度',
  'zoom.reset': '重置缩放',
  'zoom.percent': '缩放比例',
};
const defaultI18n: ZoomI18n = key => ZOOM_LABELS[key];

interface ZoomControlsProps {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitWidth: () => void;
  i18n?: ZoomI18n;
  style?: CSSProperties;
}

const buttonStyle: CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid var(--layoutpdf-color-border)',
  background: 'var(--layoutpdf-color-surface)',
  color: 'var(--layoutpdf-color-text)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
};

function iconButton(
  label: string,
  disabled: boolean,
  onClick: () => void,
  icon: IconName,
) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        ...buttonStyle,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

export default function ZoomControls({
  percent,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
  onFitWidth,
  i18n = defaultI18n,
  style,
}: ZoomControlsProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: 'var(--layoutpdf-shadow-soft)',
        ...style,
      }}
    >
      {iconButton(i18n('zoom.out'), !canZoomOut, onZoomOut, 'zoom-out')}
      <div
        title={i18n('zoom.percent')}
        style={{
          height: 28,
          minWidth: 52,
          padding: '0 8px',
          borderTop: '1px solid var(--layoutpdf-color-border)',
          borderBottom: '1px solid var(--layoutpdf-color-border)',
          background: 'var(--layoutpdf-color-surface)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--layoutpdf-color-text)',
          fontVariantNumeric: 'tabular-nums',
          boxSizing: 'border-box',
        }}
      >
        {percent}%
      </div>
      {iconButton(i18n('zoom.in'), !canZoomIn, onZoomIn, 'zoom-in')}
      {iconButton(i18n('zoom.fitWidth'), false, onFitWidth, 'width')}
      {iconButton(i18n('zoom.reset'), false, onReset, 'reset')}
    </div>
  );
}
