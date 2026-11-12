import type { TemplatePage } from '@/engine/core/document.js';
import type { SummaryBlockProps } from '@/plugins/summary/summary.js';

/**
 * Remove summary items whose source element/output no longer exists.
 *
 * Returns the number of removed items.
 */
export function removeSummaryReferences(
  page: Pick<TemplatePage, 'elements'>,
  shouldRemove: (sourceElementId: string, outputId: string) => boolean,
): number {
  let removed = 0;
  for (const element of page.elements) {
    if (element.type !== 'summary') continue;
    const props = element.props as SummaryBlockProps;
    const items = props.items.filter(item => {
      const remove = shouldRemove(item.source.sourceElementId, item.source.outputId);
      if (remove) removed += 1;
      return !remove;
    });
    if (items.length !== props.items.length) {
      element.props = { ...props, items };
    }
  }
  return removed;
}
