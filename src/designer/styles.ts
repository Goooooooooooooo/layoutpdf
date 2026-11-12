import canvasCss from '@/styles/designer.css?inline';
import propertiesCss from '@/styles/properties.css?inline';
import responsiveCss from '@/styles/responsive.css?inline';
import tokensCss from '@/styles/designer-tokens.css?inline';
import uiCss from '@/styles/ui.css?inline';
import workspaceCss from '@/styles/workspace.css?inline';
import shellCss from './designer.css?inline';

export const DESIGNER_STYLE_ID = 'layoutpdf-designer-styles';

/**
 * Every stylesheet the designer needs. Order matters: tokens first, then the
 * canvas chrome, then component styles and responsive overrides.
 */
export const designerStyleText = [
  tokensCss,
  canvasCss,
  shellCss,
  propertiesCss,
  workspaceCss,
  uiCss,
  responsiveCss,
].join('\n');

/**
 * Injects the designer stylesheet once per document. Safe in SSR and in
 * environments without a DOM, where it becomes a no-op.
 */
export function injectDesignerStyles(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc || doc.getElementById(DESIGNER_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = DESIGNER_STYLE_ID;
  style.textContent = designerStyleText;
  (doc.head ?? doc.documentElement).append(style);
}
