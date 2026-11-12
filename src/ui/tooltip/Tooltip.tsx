import { useCallback, useId, useRef, useState, type ReactNode } from 'react';

export interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  children: ReactNode;
}

export default function Tooltip({ label, side = 'bottom', className, children }: TooltipProps) {
  const id = useId();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; show: boolean }>({ left: 0, top: 0, show: false });

  const showTip = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const gap = 8;
    let left = r.left + r.width / 2;
    let top = r.top + r.height / 2;
    if (side === 'top') top = r.top - gap;
    if (side === 'bottom') top = r.bottom + gap;
    if (side === 'left') left = r.left - gap;
    if (side === 'right') left = r.right + gap;
    setPos({ left, top, show: true });
  }, [side]);

  const hideTip = useCallback(() => setPos(p => ({ ...p, show: false })), []);

  const cls = ['layoutpdf-tooltip-wrap', className].filter(Boolean).join(' ');
  return (
    <span
      ref={ref}
      className={cls}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocusCapture={showTip}
      onBlurCapture={hideTip}
    >
      {children}
      {pos.show ? (
        <span
          id={id}
          role="tooltip"
          className={`layoutpdf-tooltip layoutpdf-tooltip-${side}`}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            transform:
              side === 'top' || side === 'bottom'
                ? 'translate(-50%, 0)'
                : side === 'left'
                  ? 'translate(-100%, -50%)'
                  : 'translate(0, -50%)',
            zIndex: 99999,
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}