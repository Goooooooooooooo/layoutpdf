import { useMemo, useState } from 'react';
import type { JsonValue, TemplateElement } from '@/engine/core/document.js';
import type { DocumentState } from '@/editor/state/documentState.js';
import Button from '@/ui/button/Button.js';
import { Dialog } from '@/ui/dialog/Dialog.js';
import { TextInput } from '@/ui/input/Input.js';
import {
  createFormulaOutputReference,
  DEFAULT_FORMULA_FUNCTIONS,
  evaluateFormula,
} from '@/utils/calc.js';
import { t } from '@/i18n/index.js';
import { computeTableFooters, computeTableRows } from '@/engine/renderTree/tableLayout.js';
import type { TableValueRow } from '@/engine/renderTree/model.js';
import { TablePropsSchema } from '@/plugins/table/table.js';
import {
  BusinessFormulaWizard,
  FormulaExamples,
  FormulaFunctionGuide,
  type FormulaReferenceOption,
} from '@/editor/components/propertyPanel/FormulaExpressionInput.js';

const NUMERIC_CAPABLE_TYPES = new Set(['number', 'currency']);

interface FieldInfo {
  key: string;
  name: string;
}

function formulaContext(state: DocumentState): {
  fields: FieldInfo[];
  variables: Record<string, JsonValue>;
} {
  const record = state.inputs.records[state.inputs.activeRecordIndex] ?? {};
  const variables: Record<string, JsonValue> = {};
  const formulaFields: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(record)) {
    variables[`field.${key}`] = value;
    if (typeof value === 'number' || typeof value === 'string') formulaFields[key] = value;
  }

  const fields: FieldInfo[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of state.templateFile.template.pages.flatMap(page => page.elements)) {
    const key = candidate.binding?.key;
    if (!key || !NUMERIC_CAPABLE_TYPES.has(candidate.type)) continue;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      fields.push({ key: `field.${key}`, name: candidate.name });
    }
    if (Object.prototype.hasOwnProperty.call(formulaFields, key)) continue;
    if (typeof candidate.value === 'number' || typeof candidate.value === 'string') {
      formulaFields[key] = candidate.value;
      variables[`field.${key}`] = candidate.value;
    }
  }
  for (const candidate of state.templateFile.template.pages.flatMap(page => page.elements)) {
    if (candidate.type !== 'table') continue;
    const props = TablePropsSchema.safeParse(candidate.props);
    if (!props.success) continue;
    const inputValue = candidate.binding?.key ? record[candidate.binding.key] : undefined;
    const rawRows = Array.isArray(inputValue)
      ? inputValue
      : Array.isArray(candidate.value) ? candidate.value : [];
    const rows = rawRows.filter((row): row is TableValueRow => (
      row !== null
      && typeof row === 'object'
      && !Array.isArray(row)
      && typeof row.id === 'string'
    ));
    try {
      const computedRows = computeTableRows(props.data.columns, rows, formulaFields);
      const footers = computeTableFooters(props.data.footers, computedRows, formulaFields);
      for (const footer of footers) {
        const outputReference = createFormulaOutputReference(candidate.id, footer.id);
        variables[outputReference] = footer.value;
        if (!seenKeys.has(outputReference)) {
          seenKeys.add(outputReference);
          fields.push({
            key: outputReference,
            name: `${candidate.name} · ${footer.label}`,
          });
        }
        const key = footer.outputFieldKey?.trim();
        if (!key) continue;
        formulaFields[key] = footer.value;
        variables[`field.${key}`] = footer.value;
      }
    } catch {
      // Invalid table formulas are reported by the shared RenderTree; the editor keeps other fields available.
    }
  }
  return { fields, variables };
}

export default function CalcFormulaEditor({
  element,
  state,
  disabled,
  onChange,
}: {
  element: TemplateElement<object>;
  state: DocumentState;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const formula = typeof element.value === 'string' ? element.value : '';
  const { fields, variables } = useMemo(() => formulaContext(state), [state]);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(formula);
  const [search, setSearch] = useState('');
  const filteredFields = fields.filter(field =>
    field.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    || field.key.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const formulaReferences: FormulaReferenceOption[] = fields.map(field => ({
    token: field.key,
    label: field.name,
  }));

  let result: string | undefined;
  let issue: string | undefined;
  try {
    result = String(evaluateFormula(draft, {
      resolve(reference) {
        const value = variables[reference];
        return typeof value === 'number' || typeof value === 'string' ? value : undefined;
      },
    }));
  } catch (e) {
    issue = e instanceof Error ? e.message : t('property.formula.invalid');
  }

  const appendField = (fieldKey: string) => {
    setDraft(prev => {
      const trimmed = prev.trim();
      if (!trimmed || trimmed === '0') return fieldKey;
      const last = trimmed.charAt(trimmed.length - 1);
      const needsDefaultOp = !'+-*/(,'.includes(last);
      return `${trimmed}${needsDefaultOp ? ' + ' : ' '}${fieldKey}`;
    });
  };

  const appendOperator = (op: string) => {
    setDraft(prev => {
      const trimmed = prev.trim();
      if (!trimmed || trimmed === '0') return op;
      return `${trimmed} ${op}`;
    });
  };

  const openEditor = () => {
    setDraft(formula);
    setSearch('');
    setIsOpen(true);
  };

  return (
    <>
      <div className="layoutpdf-formula-summary">
        <code>{formula || t('property.formula.empty')}</code>
        <Button size="compact" disabled={disabled} onClick={openEditor}>
          {t('property.formula.edit')}
        </Button>
      </div>
      <Dialog
        open={isOpen}
        className="layoutpdf-formula-dialog"
        title={t('property.formula.dialogTitle')}
        description={t('property.formula.dialogDescription')}
        onClose={() => setIsOpen(false)}
        actions={(
          <>
            <Button onClick={() => setIsOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={Boolean(issue)}
              onClick={() => {
                onChange(draft);
                setIsOpen(false);
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        )}
      >
        <div className="layoutpdf-formula-builder">
          <BusinessFormulaWizard
            references={formulaReferences}
            functions={[...DEFAULT_FORMULA_FUNCTIONS]}
            currentExpression={draft}
            disabled={disabled}
            onChange={setDraft}
          />
          <label className="layoutpdf-dialog-field">
            <span>{t('property.calc.formula')}</span>
            <TextInput
              data-dialog-initial-focus
              aria-label={t('property.formula.inputAria')}
              value={draft}
              onValueChange={setDraft}
            />
          </label>
          <div className="layoutpdf-formula-result" data-invalid={Boolean(issue) || undefined}>
            <span>{issue ?? t('property.formula.result', { result: result ?? '—' })}</span>
          </div>
          <FormulaExamples
            references={formulaReferences}
            currentExpression={draft}
            disabled={disabled}
            onChange={setDraft}
          />
          <section>
            <h4>{t('property.formula.fields')}</h4>
            <TextInput
              aria-label={t('property.formula.searchFields')}
              placeholder={t('property.formula.searchFields')}
              value={search}
              onValueChange={setSearch}
            />
            <div className="layoutpdf-formula-tokens layoutpdf-formula-field-tokens" aria-label={t('property.formula.fieldsAria')}>
              {filteredFields.length > 0 ? filteredFields.map(field => (
                <Button
                  size="compact"
                  variant="ghost"
                  type="button"
                  key={field.key}
                  title={`${field.name} (${field.key})`}
                  onClick={() => appendField(field.key)}
                >
                  <span className="layoutpdf-formula-field-name">{field.name}</span>
                  <small className="layoutpdf-formula-field-key">{field.key}</small>
                </Button>
              )) : <span className="layoutpdf-panel-note">{t('property.formula.noFields')}</span>}
            </div>
          </section>
          <section>
            <h4>{t('property.formula.arithmetic')}</h4>
            <div className="layoutpdf-formula-tokens" aria-label={t('property.formula.operatorsAria')}>
              {['+', '-', '*', '/', '^', '=', '!=', '<', '<=', '>', '>='].map(op => (
                <Button size="compact" variant="ghost" type="button" key={op} onClick={() => appendOperator(op)}>
                  {op}
                </Button>
              ))}
            </div>
          </section>
          <section>
            <h4>{t('property.formula.grouping')}</h4>
            <div className="layoutpdf-formula-tokens">
              {['(', ')', ','].map(op => (
                <Button size="compact" variant="ghost" type="button" key={op} onClick={() => appendOperator(op)}>
                  {op}
                </Button>
              ))}
            </div>
          </section>
          <FormulaFunctionGuide
            functions={[...DEFAULT_FORMULA_FUNCTIONS]}
            references={formulaReferences}
            currentExpression={draft}
            disabled={disabled}
            onChange={setDraft}
          />
        </div>
      </Dialog>
    </>
  );
}
