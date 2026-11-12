import { createContext, useContext } from 'react';

export interface GridEditorController {
  open(elementId: string): void;
}

export const GridEditorContext = createContext<GridEditorController>({ open: () => {} });

export function useGridEditorController(): GridEditorController {
  return useContext(GridEditorContext);
}
