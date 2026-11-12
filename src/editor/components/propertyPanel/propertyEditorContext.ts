import { createContext, useContext } from 'react';
import {
  resolveDesignerPropertyEditor,
  type DesignerPropertyEditors,
  type ResolvedDesignerPropertyEditor,
} from '@/designer/propertyEditors.js';

export const PropertyEditorsContext = createContext<DesignerPropertyEditors | undefined>(undefined);

export function useDesignerPropertyEditors(): DesignerPropertyEditors | undefined {
  return useContext(PropertyEditorsContext);
}

export function useDesignerPropertyEditor(
  type: string | undefined,
): ResolvedDesignerPropertyEditor | undefined {
  return resolveDesignerPropertyEditor(type, useDesignerPropertyEditors());
}
