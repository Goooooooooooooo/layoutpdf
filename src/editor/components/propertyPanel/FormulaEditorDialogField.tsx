import { useMemo, useState } from 'react';
import FormulaExpressionInput, {
  type FormulaReferenceOption,
} from '@/editor/components/propertyPanel/FormulaExpressionInput.js';
import { t } from '@/i18n/index.js';
import Button from '@/ui/button/Button.js';
import { Dialog } from '@/ui/dialog/Dialog.js';
import {
  DEFAULT_FORMULA_FUNCTIONS,
  renameFormulaReferences,
  validateFormula,
} from '@/utils/calc.js';

function formulaSummary(
  expression: string,
  references: FormulaReferenceOption[],
): string {
  return renameFormulaReferences(
    expression,
    new Map(references.map(reference => [
      reference.token,
      `【${reference.label}】`,
    ])),
  );
}

export default function FormulaEditorDialogField({
  label,
  value,
  references,
  functions,
  ariaLabel,
  disabled,
  validateDraft,
  onChange,
}: {
  label: string;
  value: string;
  references: FormulaReferenceOption[];
  functions?: string[];
  ariaLabel: string;
  disabled: boolean;
  validateDraft?: (expression: string) => boolean;
  onChange(value: string): void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const issue = useMemo(() => {
    try {
      validateFormula(draft, {
        allowedFunctions: functions ?? DEFAULT_FORMULA_FUNCTIONS,
        referenceKinds: new Map(references.map(reference => [
          reference.token,
          reference.token.startsWith('column.') ? 'array' as const : 'scalar' as const,
        ])),
      });
      if (validateDraft && !validateDraft(draft)) {
        return t('property.formula.invalid');
      }
      return undefined;
    } catch {
      return t('property.formula.invalid');
    }
  }, [draft, functions, references, validateDraft]);

  const open = () => {
    setDraft(value);
    setIsOpen(true);
  };

  return (
    <>
      <div className="layoutpdf-structured-field">
        <span>{label}</span>
        <div className="layoutpdf-formula-summary">
          <code title={value}>{formulaSummary(value, references)}</code>
          <Button size="compact" variant="primary" disabled={disabled} onClick={open}>
            {t('property.formula.edit')}
          </Button>
        </div>
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
        <FormulaExpressionInput
          value={draft}
          references={references}
          functions={functions}
          ariaLabel={ariaLabel}
          disabled={disabled}
          onChange={setDraft}
        />
      </Dialog>
    </>
  );
}
