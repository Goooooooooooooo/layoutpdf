import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import type { InputRecord } from '@/engine/core/input.js';
import { getActiveInput } from '@/engine/core/input.js';
import type { TemplateFile } from '@/engine/core/document.js';
import type { DocumentEngine } from '@/engine/createEngine.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import type { GeneratePdfOptions } from '@/engine/documentSession.js';
import { useDocumentState } from '@/editor/hooks/useDocumentState.js';
import DocumentWorkspace from '@/editor/components/DocumentWorkspace.js';
import { PluginRendererProvider } from '@/editor/components/pluginRendererContext.js';
import { PropertyEditorsContext } from '@/editor/components/propertyPanel/propertyEditorContext.js';
import { createEditorClipboardPayload, instantiateEditorClipboard } from '@/editor/clipboard/editorClipboard.js';
import type { EditorClipboardPayload } from '@/editor/clipboard/editorClipboard.js';
import type { ReusableBlock } from '@/storage/reusableBlockRepository.js';
import type { DesignerStorageAdapter } from '@/storage/designerStorageAdapter.js';
import type { ElementPreset } from '@/presets/types.js';
import { SettingsContext, type SettingsApi } from '@/settings/settingsContext.js';
import {
  readEditorPreferences,
  writeEditorPreferences,
  type EditorPreferenceSettings,
  type SettingsStorage,
} from '@/settings/settingsStorage.js';
import {
  getCurrentAppLocale,
  setCurrentAppLocale,
  subscribeAppLocale,
  t,
  type AppLocale,
} from '@/i18n/index.js';
import { resolveDesignerTheme, type DesignerTheme } from '@/designer/theme.js';
import type { DesignerPropertyEditors } from '@/designer/propertyEditors.js';
import type { DesignerCommandApi } from '@/designer/commands.js';
import { DesignerErrorBoundary } from '@/designer/DesignerErrorBoundary.js';
import { ToastProvider } from '@/ui/toast/Toast.js';

export interface DesignerProps {
  engine: DocumentEngine;
  template: TemplateFile;
  input?: InputRecord;
  presets?: ElementPreset[];
  /**
   * Reusable blocks. When omitted and `storageAdapter` is provided, the
   * adapter's `listReusableBlocks` is used.
   */
  reusableBlocks?: ReusableBlock[];
  onSaveReusableBlock?(block: ReusableBlock): Promise<void>;
  onDeleteReusableBlock?(id: string): Promise<void>;
  onTemplateChange?(template: TemplateFile): void;
  onPreview?(document: RenderDocument): void;
  onExportJson?(json: string): void;
  onPdf?(pdf: Uint8Array): void | Promise<void>;
  onError?(error: Error): void;
  /** Custom property editors keyed by element type. */
  propertyEditors?: DesignerPropertyEditors;
  /** Optional template and reusable-block persistence. */
  storageAdapter?: DesignerStorageAdapter;
  /** CSS variable overrides applied to the designer root. */
  theme?: DesignerTheme;
  /** Preferences storage. Defaults to `window.localStorage` when available. */
  storage?: SettingsStorage;
  /** Storage key for persisted preferences. */
  settingsKey?: string;
  /** Sets the UI locale for this designer instance. */
  locale?: AppLocale;
  /** Replaces the built-in crash fallback. */
  errorFallback?(error: Error, reset: () => void): ReactNode;
  className?: string;
}

interface DesignerContentProps extends DesignerProps {
  commandRef?: ForwardedRef<DesignerCommandApi>;
}

const DEFAULT_EDITOR_PREFERENCES: EditorPreferenceSettings = {
  showGrid: true,
  snapEnabled: true,
  paletteCollapsed: false,
  palettePanelWidth: 220,
  propertiesCollapsed: false,
  propertiesPanelWidth: 300,
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DesignerContent({
  engine,
  template,
  input,
  presets = [],
  reusableBlocks,
  onSaveReusableBlock,
  onDeleteReusableBlock,
  onTemplateChange,
  onPreview,
  onExportJson,
  onPdf,
  onError,
  propertyEditors,
  storageAdapter,
  theme,
  storage,
  settingsKey,
  locale,
  className,
  commandRef,
}: DesignerContentProps) {
  const { state, dispatch, renderDocument } = useDocumentState(template, engine.fontManager, input, engine.plugins);
  const [editor, setEditor] = useState<EditorPreferenceSettings>(() => ({
    ...DEFAULT_EDITOR_PREFERENCES,
    ...readEditorPreferences(storage, settingsKey),
  }));
  const [blocks, setBlocks] = useState<ReusableBlock[]>(() => reusableBlocks ?? []);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const incomingTemplateRef = useRef(template);
  const publishedTemplateRef = useRef(state.templateFile);
  const [clipboard, setClipboard] = useState<EditorClipboardPayload | null>(null);
  const stateRef = useRef(state);
  const engineRef = useRef(engine);
  stateRef.current = state;
  engineRef.current = engine;

  // Re-render when the global locale changes, including changes made by
  // another designer instance or by `setCurrentAppLocale`.
  useSyncExternalStore(subscribeAppLocale, getCurrentAppLocale, getCurrentAppLocale);

  const activeInput = getActiveInput(state.inputs);
  const settings = useMemo<SettingsApi>(() => ({
    defaultSavePath: null,
    setDefaultSavePath: () => undefined,
    pdfMetadata: {},
    setPdfMetadata: () => undefined,
    editor,
    setEditorPreferences: setEditor,
    backup: { autoBackupEnabled: false, autoBackupIntervalMinutes: 10 },
    setBackup: () => undefined,
    exportFilenamePattern: '',
    setExportFilenamePattern: () => undefined,
  }), [editor]);

  useEffect(() => {
    if (!locale) return;
    setCurrentAppLocale(locale);
  }, [locale]);
  useEffect(() => {
    if (incomingTemplateRef.current === template) return;
    incomingTemplateRef.current = template;
    dispatch({ type: 'template/load', file: template });
  }, [dispatch, template]);
  useEffect(() => {
    writeEditorPreferences(editor, storage, settingsKey);
  }, [editor, settingsKey, storage]);
  useEffect(() => {
    if (publishedTemplateRef.current === state.templateFile) return;
    publishedTemplateRef.current = state.templateFile;
    onTemplateChange?.(state.templateFile);
  }, [onTemplateChange, state.templateFile]);

  const reportError = useCallback((error: unknown) => {
    const caught = error instanceof Error ? error : new Error(String(error));
    setErrorMessage(caught.message);
    onError?.(caught);
  }, [onError]);

  const storageAdapterRef = useRef(storageAdapter);
  storageAdapterRef.current = storageAdapter;
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;

  useEffect(() => {
    if (reusableBlocks !== undefined) {
      setBlocks(reusableBlocks);
      return;
    }
    const load = storageAdapterRef.current?.listReusableBlocks;
    if (!load) return;
    let cancelled = false;
    load.call(storageAdapterRef.current)
      .then(list => { if (!cancelled) setBlocks(list); })
      .catch(error => reportErrorRef.current(error));
    return () => { cancelled = true; };
  }, [reusableBlocks]);

  const saveReusableBlock = async (block: ReusableBlock) => {
    if (onSaveReusableBlock) {
      await onSaveReusableBlock(block);
      return;
    }
    if (!storageAdapter?.saveReusableBlock) return;
    await storageAdapter.saveReusableBlock(block);
    setBlocks(previous => {
      const index = previous.findIndex(item => item.id === block.id);
      if (index < 0) return [...previous, block];
      const next = [...previous];
      next[index] = block;
      return next;
    });
  };
  const deleteReusableBlock = async (id: string) => {
    if (onDeleteReusableBlock) {
      await onDeleteReusableBlock(id);
      return;
    }
    if (!storageAdapter?.deleteReusableBlock) return;
    await storageAdapter.deleteReusableBlock(id);
    setBlocks(previous => previous.filter(block => block.id !== id));
  };

  useImperativeHandle(commandRef, () => ({
    getTemplate: () => stateRef.current.templateFile,
    loadTemplate: next => {
      dispatch({ type: 'template/load', file: next });
    },
    exportJson: options => engineRef.current.stringifyTemplateJson(
      stateRef.current.templateFile,
      options ?? { space: 2 },
    ),
    preview: () => engineRef.current
      .createDocument(
        stateRef.current.templateFile,
        getActiveInput(stateRef.current.inputs),
      )
      .preview(),
    generatePdf: (options?: GeneratePdfOptions) => engineRef.current
      .createDocument(
        stateRef.current.templateFile,
        getActiveInput(stateRef.current.inputs),
      )
      .generatePdf(options),
    saveTemplate: async () => {
      const file = stateRef.current.templateFile;
      if (storageAdapter?.saveTemplate) {
        await storageAdapter.saveTemplate(file);
        return;
      }
      onTemplateChange?.(file);
    },
  }), [dispatch, onTemplateChange, storageAdapter]);

  const handleCopy = (ids: string[]) => {
    setClipboard(createEditorClipboardPayload(state.templateFile, ids));
  };
  const handlePaste = () => {
    const page = state.templateFile.template.pages.find(item => item.id === state.activePageId);
    if (!clipboard || !page) return;
    dispatch({
      type: 'elements/add',
      pageId: page.id,
      ...instantiateEditorClipboard(clipboard, {
        destinationTemplateId: state.templateFile.template.id,
        destinationPage: page,
        offset: 5,
      }),
    });
  };
  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      dispatch({ type: 'template/load', file: engine.parseTemplateJson(await file.text()) });
    } catch (error) { reportError(error); }
  };
  const exportJson = () => {
    try {
      const json = engine.stringifyTemplateJson(state.templateFile, { space: 2 });
      if (onExportJson) onExportJson(json);
      else downloadBlob(new Blob([json], { type: 'application/json' }), `${state.templateFile.template.name || 'template'}.json`);
    } catch (error) { reportError(error); }
  };
  const togglePreview = () => {
    if (state.mode === 'preview') {
      dispatch({ type: 'mode/set', mode: 'designer' });
      return;
    }
    try {
      const preview = engine.createDocument(state.templateFile, activeInput).preview();
      dispatch({ type: 'mode/set', mode: 'preview' });
      onPreview?.(preview);
    } catch (error) { reportError(error); }
  };
  const generatePdf = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      const bytes = await engine.createDocument(state.templateFile, activeInput).generatePdf();
      if (onPdf) await onPdf(bytes);
      else downloadBlob(new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: 'application/pdf' }), `${state.templateFile.template.name || 'document'}.pdf`);
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  };
  const createBlankTemplate = () => {
    dispatch({ type: 'document/new', file: engine.createTemplate({ name: t('designer.untitledTemplate') }).build() });
  };

  return (
    <SettingsContext.Provider value={settings}>
      <PropertyEditorsContext.Provider value={propertyEditors}>
        <div
          className={`layoutpdf-designer${className ? ` ${className}` : ''}`}
          style={resolveDesignerTheme(theme)}
        >
          <header className="layoutpdf-designer-toolbar">
            <strong className="layoutpdf-designer-title">{state.templateFile.template.name}</strong>
            <div className="layoutpdf-designer-actions">
              <button type="button" onClick={createBlankTemplate}>{t('designer.newTemplate')}</button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>{t('designer.importJson')}</button>
              <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={event => void handleImportJson(event)} />
              <button type="button" onClick={exportJson}>{t('designer.exportJson')}</button>
              <button type="button" onClick={togglePreview}>
                {state.mode === 'preview' ? t('designer.backToDesign') : t('designer.preview')}
              </button>
              <button type="button" disabled={busy} onClick={() => void generatePdf()}>
                {busy ? t('designer.generating') : t('designer.generatePdf')}
              </button>
            </div>
          </header>
          {errorMessage ? <div className="layoutpdf-designer-error" role="alert">{errorMessage}</div> : null}
          <PluginRendererProvider value={engine.domRenderers}>
            <DocumentWorkspace
              state={state}
              document={renderDocument}
              dispatch={dispatch}
              plugins={engine.plugins}
              presets={presets}
              reusableBlocks={blocks}
              onSaveReusableBlock={saveReusableBlock}
              onDeleteReusableBlock={deleteReusableBlock}
              hasClipboard={clipboard !== null}
              onCopy={handleCopy}
              onPaste={handlePaste}
            />
          </PluginRendererProvider>
        </div>
      </PropertyEditorsContext.Provider>
    </SettingsContext.Provider>
  );
}

const Designer = forwardRef<DesignerCommandApi, DesignerProps>(function Designer(props, ref) {
  return (
    <ToastProvider>
      <DesignerErrorBoundary onError={props.onError} fallback={props.errorFallback}>
        <DesignerContent {...props} commandRef={ref} />
      </DesignerErrorBoundary>
    </ToastProvider>
  );
});

export default Designer;
