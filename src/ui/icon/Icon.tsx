import type { ReactNode, SVGAttributes } from 'react';

export type IconName =
  | 'align-bottom'
  | 'align-center-horizontal'
  | 'align-center-vertical'
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'bring-forward'
  | 'bring-front'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'circle-x'
  | 'command'
  | 'copy'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'edit'
  | 'grip'
  | 'eye-off'
  | 'height'
  | 'help'
  | 'home'
  | 'info'
  | 'lock'
  | 'minus'
  | 'more-horizontal'
  | 'plus'
  | 'redo'
  | 'records'
  | 'reset'
  | 'search'
  | 'send-back'
  | 'send-backward'
  | 'settings'
  | 'template'
  | 'trash'
  | 'undo'
  | 'variable'
  | 'warning'
  | 'width'
  | 'x'
  | 'zoom-in'
  | 'zoom-out';

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, className, ...props }: IconProps) {
  const paths = {
    'align-bottom': <><path d="M4 20h16" /><path d="M7 16V8h4v8z" /><path d="M14 16V4h4v12z" /></>,
    'align-center-horizontal': <><path d="M12 3v18" /><path d="M4 7h6v4H4z" /><path d="M14 13h6v4h-6z" /></>,
    'align-center-vertical': <><path d="M3 12h18" /><path d="M7 4h4v6H7z" /><path d="M13 14h4v6h-4z" /></>,
    'align-left': <><path d="M4 3v18" /><path d="M8 7h10v4H8z" /><path d="M8 14h7v4H8z" /></>,
    'align-right': <><path d="M20 3v18" /><path d="M6 7h10v4H6z" /><path d="M9 14h7v4H9z" /></>,
    'align-top': <><path d="M4 4h16" /><path d="M7 8v8h4V8z" /><path d="M14 8v12h4V8z" /></>,
    'arrow-down': <><path d="m6 9 6 6 6-6" /><path d="M12 15V5" /></>,
    'arrow-left': <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    'arrow-right': <><path d="m9 18 6-6-6-6" /><path d="M5 12h10" /></>,
    'arrow-up': <><path d="m18 15-6-6-6 6" /><path d="M12 9v10" /></>,
    'bring-forward': <><rect x="8" y="4" width="10" height="10" /><path d="M14 14v6H4V10h4" /></>,
    'bring-front': <><rect x="7" y="3" width="12" height="12" /><path d="M5 8v11h11" /><path d="m12 9 3-3 3 3" /><path d="M15 6v6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    'circle-x': <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6" /><path d="m15 9-6 6" /></>,
    command: <><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M16 8V5H5v11h3" /></>,
    'distribute-horizontal': <><path d="M4 4v16" /><path d="M20 4v16" /><rect x="8" y="8" width="3" height="8" /><rect x="14" y="8" width="3" height="8" /></>,
    'distribute-vertical': <><path d="M4 4h16" /><path d="M4 20h16" /><rect x="8" y="8" width="8" height="3" /><rect x="8" y="14" width="8" height="3" /></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    grip: <><circle cx="8" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="19" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="19" r="1" fill="currentColor" stroke="none" /></>,
    'eye-off': <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 8.5 4.5 9 6-.2.7-1.1 2.2-2.5 3.5" /><path d="M6.6 6.6C4.5 8 3.3 10 3 11c.5 1.5 4 6 9 6 1 0 2-.2 2.9-.5" /></>,
    height: <><path d="M7 4h10" /><path d="M7 20h10" /><path d="M12 7v10" /><path d="m9 10 3-3 3 3" /><path d="m9 14 3 3 3-3" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
    home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    minus: <path d="M5 12h14" />,
    'more-horizontal': <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    redo: <><path d="m16 7 4 4-4 4" /><path d="M20 11h-9a6 6 0 0 0-6 6" /></>,
    records: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M7 14h6" /><path d="M7 17h4" /></>,
    reset: <><path d="M4 4v6h6" /><path d="M5.5 15a8 8 0 1 0 .5-7L4 10" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></>,
    'send-back': <><rect x="5" y="9" width="12" height="12" /><path d="M7 9V3h12v12h-2" /><path d="m12 15-3 3-3-3" /><path d="M9 18v-6" /></>,
    'send-backward': <><rect x="6" y="10" width="10" height="10" /><path d="M10 10V4h10v10h-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    template: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m7 7 1 13h8l1-13" /></>,
    undo: <><path d="m8 7-4 4 4 4" /><path d="M4 11h9a6 6 0 0 1 6 6" /></>,
    variable: <><path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" /><path d="M15 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" /><path d="m10 9 4 6" /><path d="m14 9-4 6" /></>,
    warning: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    width: <><path d="M4 7v10" /><path d="M20 7v10" /><path d="M7 12h10" /><path d="m10 9-3 3 3 3" /><path d="m14 9 3 3-3 3" /></>,
    x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    'zoom-in': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /><path d="M10.5 7.5v6" /><path d="M7.5 10.5h6" /></>,
    'zoom-out': <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /><path d="M7.5 10.5h6" /></>,
  } satisfies Record<IconName, ReactNode>;

  return (
    <svg
      {...props}
      className={['layoutpdf-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
    >
      {paths[name]}
    </svg>
  );
}
