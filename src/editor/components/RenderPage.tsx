import { memo, type ReactNode } from 'react';
import type { JsonValue } from '@/engine/core/document.js';
import type { RenderPage as RenderPageModel } from '@/engine/renderTree/model.js';
import { mmToCssPx } from '@/engine/utils/units.js';
import RenderElement, { type RenderViewMode } from '@/editor/components/RenderElement.js';

export interface RenderPageProps {
  page: RenderPageModel;
  mode: RenderViewMode;
  zoom: number;
  active?: boolean;
  onActivatePage?: (sourcePageId: string) => void;
  selectedElementIds?: string[];
  onSelect?: (elementId: string, additive: boolean) => void;
  onInputChange?: (key: string, value: JsonValue) => void;
  onInputActivate?: (key: string) => void;
  inputLabels?: Record<string, string>;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  renderPdfBackground?: (page: RenderPageModel) => ReactNode;
  renderEditorChrome?: (page: RenderPageModel) => ReactNode;
}

export default memo(function RenderPage(props: RenderPageProps) {
  const { page, zoom } = props;
  return (
    <div
      className="layoutpdf-render-page"
      data-render-page-id={page.id}
      data-source-page-id={page.sourcePageId}
      data-continuation-index={page.continuationIndex}
      data-active-page={props.active ? 'true' : 'false'}
      onPointerDown={() => props.onActivatePage?.(page.sourcePageId)}
      style={{
        width: mmToCssPx(page.size.width, zoom),
        height: mmToCssPx(page.size.height, zoom),
        background:
          page.background.kind === 'blank'
            ? page.background.color || 'var(--layoutpdf-color-page)'
            : 'var(--layoutpdf-color-page)',
      }}
    >
      {page.background.kind === 'pdf' && props.renderPdfBackground?.(page)}
      {page.nodes.map(node => (
        <RenderElement
          key={node.id}
          node={node}
          mode={props.mode}
          zoom={zoom}
          onSelect={props.onSelect}
          onInputChange={props.onInputChange}
          onInputActivate={props.onInputActivate}
          inputLabel={node.input ? props.inputLabels?.[node.input.key] : undefined}
          highlighted={props.selectedElementIds?.includes(node.sourceElementId)}
          resolveAssetUrl={props.resolveAssetUrl}
        />
      ))}
      {props.mode === 'designer' && props.renderEditorChrome?.(page)}
    </div>
  );
});
