export interface LayoutPDFFontEntry {
  data?: Uint8Array | ArrayBuffer | string;
  fallback?: boolean;
  subset?: boolean;
  label?: string;
  /** Faces with the same family are selected by their logical text weight. */
  family?: string;
  weight?: 'normal' | 'bold';
}

export type LayoutPDFFont = Record<string, LayoutPDFFontEntry>;
