import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch } from 'react';
import type { RenderDocument, RenderPage } from '@/engine/renderTree/model.js';
import { mmToCssPx } from '@/engine/utils/units.js';
import type { DocumentAction, DocumentMode, DocumentState } from '@/editor/state/documentState.js';
import { getViewportSourcePageId } from '@/editor/layout/documentPages.js';
import DesignerChrome from '@/editor/components/DesignerChrome.js';
import RenderDocumentView from '@/editor/components/RenderDocumentView.js';
import TemplatePdfBackground from '@/editor/components/TemplatePdfBackground.js';
import useZoomController from '@/editor/hooks/useZoomController.js';
import FloatingToolbar from '@/editor/components/FloatingToolbar.js';
import { useSettings } from '@/settings/settingsContext.js';
import { useGridEditorController } from '@/editor/components/propertyPanel/grid/gridEditorContext.js';
import { toggleElementGroupSelection } from '@/engine/core/elementGroups.js';
import { resolveDesignerShortcut } from '@/editor/commands/designerShortcuts.js';

interface DocumentCanvasProps {
  state: DocumentState;
  document: RenderDocument;
  dispatch: Dispatch<DocumentAction>;
  mode: DocumentMode;
  hasClipboard: boolean;
  onCopy(ids: string[]): void;
  onPaste(): void;
}

export default function DocumentCanvas({
  state,
  document,
  dispatch,
  mode,
  hasClipboard,
  onCopy,
  onPaste,
}: DocumentCanvasProps) {
  const gridEditor = useGridEditorController();
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoom = useZoomController({ defaultScale: 0.9 });
  const { editor, setEditorPreferences } = useSettings();
  const { showGrid, snapEnabled } = editor;
  const canvasActivatedPageRef = useRef<string | null>(null);
  const handledActivePageRef = useRef<string | null>(null);
  const programmaticScrollPageRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const maxPageWidth = useMemo(
    () => Math.max(...document.pages.map(page => mmToCssPx(page.size.width, 1)), 1),
    [document.pages],
  );
  const activateCanvasPage = useCallback((pageId: string) => {
    if (pageId === state.activePageId) return;
    canvasActivatedPageRef.current = pageId;
    dispatch({ type: 'page/activate', pageId });
  }, [dispatch, state.activePageId]);

  const handleElementDoubleClick = useCallback((id: string) => {
    const sourcePage = state.templateFile.template.pages.find(page =>
      page.elements.some(element => element.id === id)
    );
    if (sourcePage) activateCanvasPage(sourcePage.id);
    dispatch({ type: 'selection/set', ids: [id] });
    const element = sourcePage?.elements.find(candidate => candidate.id === id);
    if (element?.type === 'grid') {
      gridEditor.open(id);
      return;
    }
    if (editor.propertiesCollapsed) {
      setEditorPreferences({ ...editor, propertiesCollapsed: false });
    }
  }, [state.templateFile.template.pages, activateCanvasPage, dispatch, editor, gridEditor, setEditorPreferences]);

  const syncPageFromViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || programmaticScrollPageRef.current) return;
    const viewportRect = viewport.getBoundingClientRect();
    const focusY = viewportRect.top + viewportRect.height * 0.35;
    const pages = [...viewport.querySelectorAll<HTMLElement>('[data-render-page-id]')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        sourcePageId: element.dataset.sourcePageId ?? '',
        top: rect.top,
        bottom: rect.bottom,
      };
    }).filter(page => page.sourcePageId);
    const pageId = getViewportSourcePageId(pages, focusY);
    if (pageId) activateCanvasPage(pageId);
  }, [activateCanvasPage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scheduleSync = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        syncPageFromViewport();
      });
    };
    viewport.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync);
    scheduleSync();
    return () => {
      viewport.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    };
  }, [document.pages, syncPageFromViewport, zoom.scale]);

  useEffect(() => {
    if (mode !== 'preview') return;
    const exitPreview = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dispatch({ type: 'mode/set', mode: 'designer' });
    };
    window.addEventListener('keydown', exitPreview);
    return () => window.removeEventListener('keydown', exitPreview);
  }, [dispatch, mode]);

  useEffect(() => {
    if (mode !== 'designer') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveDesignerShortcut(event);
      if (!shortcut) return;
      const selected = state.selectedElementIds;
      const page = state.templateFile.template.pages.find(candidate =>
        candidate.id === state.activePageId
      ) ?? state.templateFile.template.pages[0];
      switch (shortcut.type) {
        case 'undo':
        case 'redo':
          event.preventDefault();
          dispatch({ type: shortcut.type === 'undo' ? 'history/undo' : 'history/redo' });
          return;
        case 'delete':
          if (selected.length === 0) return;
          event.preventDefault();
          dispatch({ type: 'element/delete', ids: selected });
          return;
        case 'copy':
          if (selected.length === 0) return;
          event.preventDefault();
          onCopy(selected);
          return;
        case 'paste':
          if (!hasClipboard) return;
          event.preventDefault();
          onPaste();
          return;
        case 'duplicate':
          if (selected.length === 0) return;
          event.preventDefault();
          dispatch({ type: 'element/duplicate', ids: selected });
          return;
        case 'select-all':
          if (!page || page.elements.length === 0) return;
          event.preventDefault();
          dispatch({ type: 'selection/set', ids: page.elements.map(element => element.id) });
          return;
        case 'group':
        case 'ungroup':
          if (!page || selected.length === 0) return;
          event.preventDefault();
          dispatch(shortcut.type === 'group'
            ? { type: 'element/group', pageId: page.id, ids: selected }
            : { type: 'element/ungroup', pageId: page.id, ids: selected });
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    dispatch,
    hasClipboard,
    mode,
    onCopy,
    onPaste,
    state.activePageId,
    state.selectedElementIds,
    state.templateFile.template.pages,
  ]);

  useEffect(() => {
    // Callback identity changes must not reposition a page that the user is already viewing.
    if (handledActivePageRef.current === state.activePageId) return;
    if (canvasActivatedPageRef.current === state.activePageId) {
      canvasActivatedPageRef.current = null;
      handledActivePageRef.current = state.activePageId;
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = [...viewport.querySelectorAll<HTMLElement>('[data-render-page-id]')].find(element =>
      element.dataset.sourcePageId === state.activePageId
      && element.dataset.continuationIndex === '0'
    );
    if (!target) return;
    handledActivePageRef.current = state.activePageId;
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    programmaticScrollPageRef.current = state.activePageId;
    viewport.scrollTo({
      top: Math.max(0, viewport.scrollTop + targetRect.top - viewportRect.top - 48),
      left: viewport.scrollLeft,
      behavior: 'auto',
    });
    const frame = requestAnimationFrame(() => {
      if (programmaticScrollPageRef.current === state.activePageId) {
        programmaticScrollPageRef.current = null;
      }
      syncPageFromViewport();
    });
    return () => {
      cancelAnimationFrame(frame);
      // StrictMode can cancel the first frame before it releases this scroll-suppression marker.
      if (programmaticScrollPageRef.current === state.activePageId) {
        programmaticScrollPageRef.current = null;
      }
    };
  }, [state.activePageId, syncPageFromViewport]);
  const resolveAssetUrl = (assetId: string) => {
    const asset = state.templateFile.assets[assetId];
    return asset?.kind === 'image' ? `data:${asset.mimeType};base64,${asset.data}` : undefined;
  };
  const renderBackground = (page: RenderPage) => {
    const assetId = page.background.assetId;
    const asset = assetId ? state.templateFile.assets[assetId] : undefined;
    if (!asset) return null;
    return (
      <TemplatePdfBackground
        asset={asset}
        pageIndex={page.background.pageIndex ?? 0}
        widthPx={mmToCssPx(page.size.width, zoom.scale)}
        heightPx={mmToCssPx(page.size.height, zoom.scale)}
      />
    );
  };

  return (
    <div
      ref={viewportRef}
      className="layoutpdf-canvas-viewport"
      tabIndex={-1}
      onMouseDown={event => {
        if (mode === 'designer' && event.target === event.currentTarget) {
          dispatch({ type: 'selection/set', ids: [] });
        }
      }}
    >
      <FloatingToolbar
        percent={zoom.percent}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onReset={zoom.resetZoom}
        onFitWidth={() => zoom.fitWidth(
          viewportRef.current?.clientWidth ?? 0,
          maxPageWidth,
          80,
        )}
        showGrid={showGrid}
        snapEnabled={snapEnabled}
        onToggleGrid={() => setEditorPreferences({ ...editor, showGrid: !showGrid })}
        onToggleSnap={() => setEditorPreferences({ ...editor, snapEnabled: !snapEnabled })}
        mode={mode}
        onTogglePreview={() => dispatch({
          type: 'mode/set',
          mode: mode === 'preview' ? 'designer' : 'preview',
        })}
      />
      <RenderDocumentView
        document={document}
        mode={mode}
        zoom={zoom.scale}
        activeSourcePageId={state.activePageId}
        onActivatePage={activateCanvasPage}
        selectedElementIds={state.selectedElementIds}
        onSelect={(id, additive) => {
          const sourcePage = state.templateFile.template.pages.find(page =>
            page.elements.some(element => element.id === id)
          );
          if (sourcePage) activateCanvasPage(sourcePage.id);
          const ids = additive && sourcePage
            ? toggleElementGroupSelection(sourcePage, state.selectedElementIds, id)
            : [id];
          dispatch({ type: 'selection/set', ids });
        }}
        onInputChange={undefined}
        resolveAssetUrl={resolveAssetUrl}
        renderPdfBackground={renderBackground}
        renderEditorChrome={page => (
          <DesignerChrome
            page={page}
            state={state}
            dispatch={dispatch}
            zoom={zoom.scale}
            showGrid={showGrid}
            snapEnabled={snapEnabled}
            hasClipboard={hasClipboard}
            onCopy={onCopy}
            onPaste={onPaste}
            onActivatePage={activateCanvasPage}
            onDoubleClickElement={handleElementDoubleClick}
          />
        )}
      />
    </div>
  );
}
