import type { GridProps } from '@/plugins/grid/grid.js';
import Button from '@/ui/button/Button.js';
import { t } from '@/i18n/index.js';
import { useGridEditorController } from './gridEditorContext.js';

interface GridPropertySummaryProps {
  elementId: string;
  props: GridProps;
}

export default function GridPropertySummary({ elementId, props }: GridPropertySummaryProps) {
  const editor = useGridEditorController();
  const merged = Object.values(props.cells).filter(cell =>
    (cell.columnSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1
  ).length;
  const formulas = Object.values(props.cells).filter(cell => cell.content.startsWith('=')).length;
  return (
    <div className="layoutpdf-grid-property-summary">
      <p>
        {t('property.grid.summary', {
          columns: props.columns.length,
          rows: props.rows.length,
          merged,
          formulas,
        })}
      </p>
      <Button variant="primary" data-grid-editor-trigger={elementId} onClick={() => editor.open(elementId)}>
        {t('property.grid.edit')}
      </Button>
    </div>
  );
}
