import type { ReactNode } from 'react';

export interface AppFrameProps {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}

export default function AppFrame({ sidebar, header, children }: AppFrameProps) {
  return (
    <div className="layoutpdf-app-frame">
      {sidebar}
      <div className="layoutpdf-app-frame-main">
        {header}
        {children}
      </div>
    </div>
  );
}