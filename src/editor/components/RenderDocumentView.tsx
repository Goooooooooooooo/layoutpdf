import type { ReactNode } from 'react';
import type { JsonValue } from '@/engine/core/document.js';
import type { DomPluginRenderContext } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import type { RenderDocument, RenderPage as RenderPageModel } from '@/engine/renderTree/model.js';
import RenderPage from '@/editor/components/RenderPage.js';
import type { RenderViewMode } from '@/editor/components/RenderElement.js';
import {
  PluginRendererProvider,
  usePluginRendererRegistry,
} from '@/editor/components/pluginRendererContext.js';

export interface RenderDocumentViewProps {
  document: RenderDocument;
  mode: RenderViewMode;
  zoom?: number;
  activeSourcePageId?: string;
  onActivatePage?: (sourcePageId: string) => void;
  selectedElementIds?: string[];
  onSelect?: (elementId: string, additive: boolean) => void;
  onInputChange?: (key: string, value: JsonValue) => void;
  onInputActivate?: (key: string) => void;
  inputLabels?: Record<string, string>;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  renderPdfBackground?: (page: RenderPageModel) => ReactNode;
  renderEditorChrome?: (page: RenderPageModel) => ReactNode;
  pluginRenderers?: PluginRendererRegistry<DomPluginRenderContext>;
}

export default function RenderDocumentView({
  document,
  mode,
  zoom = 1,
  activeSourcePageId,
  onActivatePage,
  selectedElementIds,
  onSelect,
  onInputChange,
  onInputActivate,
  inputLabels,
  resolveAssetUrl,
  renderPdfBackground,
  renderEditorChrome,
  pluginRenderers,
}: RenderDocumentViewProps) {
  const inheritedPluginRenderers = usePluginRendererRegistry();
  const effectivePluginRenderers = pluginRenderers ?? inheritedPluginRenderers;

  return (
    <PluginRendererProvider value={effectivePluginRenderers}>
      <div
        data-render-document-id={document.templateId}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}
      >
        {document.pages.map(page => (
          <RenderPage
            key={page.id}
            page={page}
            mode={mode}
            zoom={zoom}
            active={page.sourcePageId === activeSourcePageId}
            onActivatePage={onActivatePage}
            selectedElementIds={selectedElementIds}
            onSelect={onSelect}
            onInputChange={onInputChange}
            onInputActivate={onInputActivate}
            inputLabels={inputLabels}
            resolveAssetUrl={resolveAssetUrl}
            renderPdfBackground={renderPdfBackground}
            renderEditorChrome={renderEditorChrome}
          />
        ))}
      </div>
    </PluginRendererProvider>
  );
}
