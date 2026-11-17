import { useCallback } from 'react';
import type { Dispatch } from 'react';
import type { LayoutPDFTemplate } from '@/engine/core/document.js';
import type { DocumentAction } from '@/editor/state/documentState.js';
import { useToast } from '@/ui/toast/useToast.js';
import { t } from '@/i18n/index.js';
import { collectDanglingOutputReferences } from '@/editor/utils/danglingOutputReferences.js';

/**
 * Deletes elements and warns when a surviving formula still points at an
 * output owned by one of them. The delete is not blocked: the reference stays
 * in the template so undo restores a working state.
 */
export function useDeleteElements(
  template: LayoutPDFTemplate,
  dispatch: Dispatch<DocumentAction>,
): (ids: readonly string[]) => void {
  const toast = useToast();
  return useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    const dangling = collectDanglingOutputReferences(template, ids);
    dispatch({ type: 'element/delete', ids: [...ids] });
    if (dangling.length === 0) return;
    toast.warning(
      t('editor.chrome.danglingOutputsTitle'),
      t('editor.chrome.danglingOutputsDetail', { count: dangling.length }),
    );
  }, [dispatch, template, toast]);
}
