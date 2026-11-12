import type { CSSProperties } from 'react';
import type { DomPluginRenderContext } from '@/engine/core/plugin.js';
import type { PluginRendererRegistry } from '@/engine/core/pluginRendererRegistry.js';
import type { RenderDocument } from '@/engine/renderTree/model.js';
import RenderDocumentView from '@/editor/components/RenderDocumentView.js';

export { default as RenderDocumentView } from '@/editor/components/RenderDocumentView.js';
export type { RenderDocumentViewProps } from '@/editor/components/RenderDocumentView.js';
export { default as RenderPage } from '@/editor/components/RenderPage.js';
export type { RenderPageProps } from '@/editor/components/RenderPage.js';
export { default as RenderElement } from '@/editor/components/RenderElement.js';
export type { RenderElementProps, RenderViewMode } from '@/editor/components/RenderElement.js';

export interface PreviewDocumentProps {
  document: RenderDocument;
  zoom?: number;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  pluginRenderers?: PluginRendererRegistry<DomPluginRenderContext>;
  className?: string;
  style?: CSSProperties;
}

/**
 * Lightweight read-only preview. For editing or form input, use the designer
 * entry or the lower-level RenderDocumentView component.
 */
export function PreviewDocument({
  document,
  zoom = 1,
  resolveAssetUrl,
  pluginRenderers,
  className,
  style,
}: PreviewDocumentProps) {
  return (
    <div className={className} style={style}>
      <RenderDocumentView
        document={document}
        mode="preview"
        zoom={zoom}
        resolveAssetUrl={resolveAssetUrl}
        pluginRenderers={pluginRenderers}
      />
    </div>
  );
}
