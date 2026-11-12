import type { IdGenerator, TemplateElement } from '@/engine/core/document.js';
import type { TableValueRow } from '@/engine/renderTree/model.js';
import type { TableProps } from '@/plugins/table/table.js';
import { renameFormulaReferences } from '@/utils/calc.js';

export function assignFreshTableIdentities(
  table: TemplateElement<TableProps, TableValueRow[]>,
  createId: IdGenerator,
): void {
  table.props.columns = table.props.columns.map(column => ({
    ...column,
    id: createId('el'),
  }));

  const footerIds = new Map(table.props.footers.map(footer => [footer.id, createId('el')]));
  table.props.footers = table.props.footers.map(footer => ({
    ...footer,
    id: footerIds.get(footer.id)!,
    formula: {
      ...footer.formula,
      expression: renameFormulaReferences(
        footer.formula.expression,
        new Map(
          [...footerIds].map(([previousId, nextId]) => [
            `footer.${previousId}`,
            `footer.${nextId}`,
          ]),
        ),
      ),
    },
  }));
}
