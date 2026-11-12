import type { TemplatePage } from '@/engine/core/document.js';
import type { SummaryBlockProps } from '@/plugins/summary/summary.js';
import type { TableProps } from '@/plugins/table/table.js';
import { CheckboxInput } from '@/ui/input/Input.js';
import { t } from '@/i18n/index.js';

export default function ElementOutputPicker({
  page,
  props,
  disabled,
  onToggle,
}: {
  page: TemplatePage;
  props: SummaryBlockProps;
  disabled: boolean;
  onToggle(sourceElementId: string, outputId: string, selected: boolean): void;
}) {
  const tables = page.elements.filter(element =>
    element.type === 'table'
    && !element.hidden
    && (element.props as TableProps).footers.length > 0
  );
  if (tables.length === 0) {
    return <p className="layoutpdf-panel-note">{t('property.summary.noSources')}</p>;
  }
  return (
    <div className="layoutpdf-summary-output-picker">
      {tables.map(table => {
        const tableProps = table.props as TableProps;
        return (
          <fieldset key={table.id} className="layoutpdf-summary-source-group">
            <legend>{table.name}</legend>
            {tableProps.footers.map(footer => {
              const selected = props.items.some(item =>
                item.source.sourceElementId === table.id
                && item.source.outputId === footer.id
              );
              const id = `summary-output-${table.id}-${footer.id}`;
              return (
                <label key={footer.id} htmlFor={id} className="layoutpdf-checkbox-row">
                  <CheckboxInput
                    id={id}
                    checked={selected}
                    disabled={disabled}
                    onCheckedChange={checked => onToggle(table.id, footer.id, checked)}
                  />
                  <span>{footer.label}</span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
