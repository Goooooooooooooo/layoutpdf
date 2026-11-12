import { useMemo, useState } from 'react';
import Button from '@/ui/button/Button.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';
import {
  DEFAULT_FORMULA_FUNCTIONS,
  getFormulaReferences,
  renameFormulaReferences,
  validateFormula,
} from '@/utils/calc.js';
import {
  buildFormulaFunctionExample,
  FORMULA_FUNCTION_CATEGORIES,
  FORMULA_FUNCTION_HELP,
  formatFormulaValidationError,
  formulaHelpText,
  type FormulaReferenceOption,
} from '@/editor/components/propertyPanel/formulaHelp.js';
import {
  availableBusinessFormulaRecipes,
  availableBusinessFormulaRoundingFunctions,
  buildBusinessFormula,
  type BusinessFormulaRecipeId,
  type BusinessFormulaRoundingFunction,
} from '@/editor/components/propertyPanel/businessFormulaWizard.js';

export type { FormulaReferenceOption } from '@/editor/components/propertyPanel/formulaHelp.js';

function appendToken(expression: string, token: string): string {
  const trimmed = expression.trim();
  if (!trimmed || trimmed === '0') return token;
  const last = trimmed.at(-1) ?? '';
  const needsOperator = !'+-*/%^=(<>,'.includes(last);
  return `${trimmed}${needsOperator ? ' + ' : ' '}${token}`;
}

const RECIPE_HELP: Record<BusinessFormulaRecipeId, {
  title: Parameters<typeof formulaHelpText>[0];
  hint: Parameters<typeof formulaHelpText>[0];
}> = {
  multiply: { title: 'recipeMultiply', hint: 'recipeMultiplyHint' },
  addSubtract: { title: 'recipeAddSubtract', hint: 'recipeAddSubtractHint' },
  columnTotal: { title: 'recipeColumnTotal', hint: 'recipeColumnTotalHint' },
  tax: { title: 'recipeTax', hint: 'recipeTaxHint' },
  taxIncluded: { title: 'recipeTaxIncluded', hint: 'recipeTaxIncludedHint' },
  rowNumber: { title: 'recipeRowNumber', hint: 'recipeRowNumberHint' },
  runningTotal: { title: 'recipeRunningTotal', hint: 'recipeRunningTotalHint' },
};

export function BusinessFormulaWizard({
  references,
  functions,
  currentExpression = '',
  disabled,
  onChange,
}: {
  references: FormulaReferenceOption[];
  functions: string[];
  currentExpression?: string;
  disabled: boolean;
  onChange(expression: string): void;
}) {
  const recipes = availableBusinessFormulaRecipes(references, functions);
  const roundingFunctions = availableBusinessFormulaRoundingFunctions(functions);
  let initialReference = references[0]?.token ?? '';
  try {
    const currentReferences = new Set(getFormulaReferences(currentExpression));
    initialReference = references.find(reference => currentReferences.has(reference.token))?.token
      ?? initialReference;
  } catch {
    // Keep the first available business field while an existing expression is incomplete.
  }
  const [selectedRecipe, setSelectedRecipe] = useState<BusinessFormulaRecipeId>(
    recipes[0] ?? 'tax',
  );
  const [primaryReference, setPrimaryReference] = useState(initialReference);
  const [secondaryReference, setSecondaryReference] = useState(
    references.find(reference => reference.token !== initialReference)?.token ?? '',
  );
  const [operator, setOperator] = useState<'+' | '-'>('+');
  const [percent, setPercent] = useState<number | null>(10);
  const [roundingFunction, setRoundingFunction] = useState<string>(
    roundingFunctions[0] ?? '',
  );
  const [decimalPlaces, setDecimalPlaces] = useState<number | null>(0);
  if (recipes.length === 0) return null;

  const recipe = recipes.includes(selectedRecipe) ? selectedRecipe : recipes[0];
  const scalarReferences = references.filter(reference => !reference.token.startsWith('column.'));
  const columnReferences = references.filter(reference => reference.token.startsWith('column.'));
  const rowReferences = references.filter(reference => reference.token.startsWith('row.'));
  const selectableReferences = recipe === 'columnTotal'
    ? columnReferences
    : recipe === 'runningTotal'
      ? rowReferences
      : ['multiply', 'addSubtract'].includes(recipe)
        ? scalarReferences
        : references;
  const primary = selectableReferences.some(reference => reference.token === primaryReference)
    ? primaryReference
    : selectableReferences[0]?.token ?? '';
  const secondaryCandidates = selectableReferences.filter(reference => reference.token !== primary);
  const secondary = secondaryCandidates.some(reference => reference.token === secondaryReference)
    ? secondaryReference
    : secondaryCandidates[0]?.token ?? primary;
  const expression = buildBusinessFormula({
    recipe,
    primaryReference: primary,
    secondaryReference: secondary,
    operator,
    percent: percent ?? 0,
    roundingFunction: roundingFunction as BusinessFormulaRoundingFunction || undefined,
    decimalPlaces: decimalPlaces ?? 0,
  });
  const referenceLabels = new Map(references.map(reference => [
    reference.token,
    `【${reference.label}】`,
  ]));
  const needsPrimary = !['rowNumber'].includes(recipe);
  const needsSecondary = ['multiply', 'addSubtract'].includes(recipe);
  const needsTaxOptions = ['tax', 'taxIncluded'].includes(recipe);

  return (
    <section className="layoutpdf-business-formula-wizard">
      <div className="layoutpdf-formula-section-heading">
        <h4>{formulaHelpText('wizardTitle')}</h4>
        <span>{formulaHelpText('wizardHint')}</span>
      </div>
      <div className="layoutpdf-business-formula-recipes">
        {recipes.map(candidate => (
          <Button
            key={candidate}
            type="button"
            variant="secondary"
            className="layoutpdf-business-formula-recipe"
            aria-pressed={recipe === candidate}
            disabled={disabled}
            onClick={() => setSelectedRecipe(candidate)}
          >
            <strong>{formulaHelpText(RECIPE_HELP[candidate].title)}</strong>
            <small>{formulaHelpText(RECIPE_HELP[candidate].hint)}</small>
          </Button>
        ))}
      </div>
      <div className="layoutpdf-business-formula-controls">
        {needsPrimary ? (
          <label>
            <span>{formulaHelpText('wizardPrimary')}</span>
            <Select
              value={primary}
              options={selectableReferences.map(reference => ({
                value: reference.token,
                label: reference.label,
              }))}
              disabled={disabled}
              onChange={setPrimaryReference}
            />
          </label>
        ) : null}
        {needsSecondary ? (
          <label>
            <span>{formulaHelpText('wizardSecondary')}</span>
            <Select
              value={secondary}
              options={secondaryCandidates.map(reference => ({
                value: reference.token,
                label: reference.label,
              }))}
              disabled={disabled}
              onChange={setSecondaryReference}
            />
          </label>
        ) : null}
        {recipe === 'addSubtract' ? (
          <label>
            <span>{formulaHelpText('wizardOperator')}</span>
            <Select
              value={operator}
              options={[
                { value: '+', label: '+' },
                { value: '-', label: '−' },
              ]}
              disabled={disabled}
              onChange={value => setOperator(value as '+' | '-')}
            />
          </label>
        ) : null}
        {needsTaxOptions ? (
          <>
            <label>
              <span>{formulaHelpText('wizardTaxRate')}</span>
              <NumberInput
                min={0}
                value={percent}
                disabled={disabled}
                onValueChange={setPercent}
              />
            </label>
            <label>
              <span>{formulaHelpText('wizardRounding')}</span>
              <Select
                value={roundingFunction}
                options={[
                  { value: '', label: formulaHelpText('roundingNone') },
                  ...roundingFunctions.map(name => ({ value: name, label: name })),
                ]}
                disabled={disabled}
                onChange={setRoundingFunction}
              />
            </label>
            {roundingFunction ? (
              <label>
                <span>{formulaHelpText('wizardDecimalPlaces')}</span>
                <NumberInput
                  min={0}
                  max={10}
                  step={1}
                  value={decimalPlaces}
                  disabled={disabled}
                  onValueChange={setDecimalPlaces}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="layoutpdf-business-formula-preview">
        <span>{formulaHelpText('wizardPreview')}</span>
        <code>{renameFormulaReferences(expression, referenceLabels)}</code>
        <Button
          type="button"
          variant="primary"
          size="compact"
          disabled={disabled}
          onClick={() => onChange(expression)}
        >
          {formulaHelpText('wizardApply')}
        </Button>
      </div>
    </section>
  );
}

function formulaExamples(
  references: FormulaReferenceOption[],
  currentExpression: string,
): Array<{
  label: string;
  expression: string;
}> {
  const footerReferences = references.filter(reference => reference.token.startsWith('footer.'));
  const columnReferences = references.filter(reference => reference.token.startsWith('column.'));
  let currentReferenceTokens = new Set<string>();
  try {
    currentReferenceTokens = new Set(getFormulaReferences(currentExpression));
  } catch {
    // Keep examples available while the user is fixing an incomplete expression.
  }
  const currentFooterReferences = footerReferences
    .filter(reference => currentReferenceTokens.has(reference.token));
  const currentColumnReferences = columnReferences
    .filter(reference => currentReferenceTokens.has(reference.token));
  const currentScalarReferences = references.filter(reference => (
    !reference.token.startsWith('column.')
    && currentReferenceTokens.has(reference.token)
  ));
  const base = currentFooterReferences[0]
    ?? currentColumnReferences.at(-1)
    ?? currentScalarReferences.at(-1)
    ?? columnReferences.at(-1)
    ?? references.at(-1);
  const baseExpression = base?.token.startsWith('column.')
    ? `SUM(${base.token})`
    : base?.token;
  const examples = [{
    label: t('property.formula.examplePercent'),
    expression: 'PERCENT(10)',
  }];
  if (baseExpression) {
    examples.push(
      {
        label: t('property.formula.exampleTax'),
        expression: `ROUND(${baseExpression} * PERCENT(10), 0)`,
      },
      {
        label: t('property.formula.exampleTaxIncluded'),
        expression: `${baseExpression} + ROUND(${baseExpression} * PERCENT(10), 0)`,
      },
    );
  }
  if (currentFooterReferences.length >= 2) {
    const [left, right] = currentFooterReferences;
    examples.push({
      label: t('property.formula.exampleAddTwo'),
      expression: `${left.token} + ${right.token}`,
    });
  }
  return examples;
}

export function FormulaFunctionGuide({
  functions,
  references,
  currentExpression,
  disabled,
  onChange,
}: {
  functions: string[];
  references: FormulaReferenceOption[];
  currentExpression: string;
  disabled: boolean;
  onChange(expression: string): void;
}) {
  const referenceLabels = new Map(references.map(reference => [
    reference.token,
    `【${reference.label}】`,
  ]));
  const categories = FORMULA_FUNCTION_CATEGORIES
    .map(category => ({
      category,
      functions: functions.filter(name => FORMULA_FUNCTION_HELP[name]?.category === category),
    }))
    .filter(group => group.functions.length > 0);
  const unknownFunctions = functions.filter(name => !FORMULA_FUNCTION_HELP[name]);

  return (
    <section className="layoutpdf-formula-function-guide">
      <div className="layoutpdf-formula-section-heading">
        <h4>{formulaHelpText('guideTitle')}</h4>
        <span>{formulaHelpText('guideHint')}</span>
      </div>
      {categories.map(group => (
        <details className="layoutpdf-formula-function-group" key={group.category}>
          <summary>{formulaHelpText(group.category)}</summary>
          <div className="layoutpdf-formula-function-list">
            {group.functions.map(name => {
              const help = FORMULA_FUNCTION_HELP[name];
              const example = buildFormulaFunctionExample(name, references, currentExpression);
              return (
                <article className="layoutpdf-formula-function-card" key={name}>
                  <div>
                    <strong>{name}</strong>
                    <code>{help.signature}</code>
                    <p>{formulaHelpText(help.descriptionKey)}</p>
                  </div>
                  <Button
                    size="compact"
                    variant="secondary"
                    className="layoutpdf-formula-function-example"
                    type="button"
                    disabled={disabled}
                    aria-label={formulaHelpText('applyFunctionExample', { name })}
                    onClick={() => onChange(example)}
                  >
                    <span>{formulaHelpText('applyExample')}</span>
                    <code>{renameFormulaReferences(example, referenceLabels)}</code>
                  </Button>
                </article>
              );
            })}
          </div>
        </details>
      ))}
      {unknownFunctions.length > 0 ? (
        <div className="layoutpdf-formula-tokens">
          {unknownFunctions.map(name => (
            <Button
              key={name}
              size="compact"
              variant="ghost"
              type="button"
              disabled={disabled}
              onClick={() => onChange(appendToken(currentExpression, `${name}(`))}
            >
              {name}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function FormulaExamples({
  references,
  currentExpression,
  disabled,
  onChange,
}: {
  references: FormulaReferenceOption[];
  currentExpression: string;
  disabled: boolean;
  onChange(expression: string): void;
}) {
  const examples = formulaExamples(references, currentExpression);
  const referenceLabels = new Map(references.map(reference => [
    reference.token,
    `【${reference.label}】`,
  ]));
  return (
    <section className="layoutpdf-formula-examples">
      <h4>{t('property.formula.quickExamples')}</h4>
      <p className="layoutpdf-panel-note">{t('property.formula.percentHint')}</p>
      <div className="layoutpdf-formula-example-list">
        {examples.map(example => (
          <Button
            key={example.label}
            size="compact"
            variant="secondary"
            className="layoutpdf-formula-example-card"
            type="button"
            disabled={disabled}
            aria-label={formulaHelpText('applyNamedExample', { name: example.label })}
            onClick={() => onChange(example.expression)}
          >
            <span className="layoutpdf-formula-example-card-heading">
              <strong>{example.label}</strong>
              <small>{formulaHelpText('applyExample')}</small>
            </span>
            <code>{renameFormulaReferences(example.expression, referenceLabels)}</code>
          </Button>
        ))}
      </div>
    </section>
  );
}

export default function FormulaExpressionInput({
  value,
  references,
  functions = [...DEFAULT_FORMULA_FUNCTIONS],
  ariaLabel,
  disabled,
  onChange,
}: {
  value: string;
  references: FormulaReferenceOption[];
  functions?: string[];
  ariaLabel: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const issue = useMemo(() => {
    try {
      validateFormula(value, {
        allowedFunctions: functions,
        referenceKinds: new Map(references.map(reference => [
          reference.token,
          reference.token.startsWith('column.') ? 'array' as const : 'scalar' as const,
        ])),
      });
      return undefined;
    } catch (error) {
      return formatFormulaValidationError(error);
    }
  }, [functions, references, value]);

  return (
    <div className="layoutpdf-formula-builder layoutpdf-formula-builder-inline">
      <BusinessFormulaWizard
        references={references}
        functions={functions}
        currentExpression={value}
        disabled={disabled}
        onChange={onChange}
      />
      <section className="layoutpdf-advanced-formula">
        <div className="layoutpdf-formula-section-heading">
          <h4>{formulaHelpText('advancedTitle')}</h4>
          <span>{formulaHelpText('advancedHint')}</span>
        </div>
        <TextInput
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
        />
        <div className="layoutpdf-formula-result" data-invalid={Boolean(issue) || undefined}>
          {issue ?? t('property.formula.syntaxValid')}
        </div>
      </section>
      <FormulaExamples
        references={references}
        currentExpression={value}
        disabled={disabled}
        onChange={onChange}
      />
      <section>
        <h4>{t('property.formula.fields')}</h4>
        <div className="layoutpdf-formula-tokens layoutpdf-formula-field-tokens">
          {references.length > 0 ? references.map(reference => (
            <Button
              key={reference.token}
              size="compact"
              variant="ghost"
              type="button"
              disabled={disabled}
              title={`${reference.label} (${reference.token})`}
              onClick={() => onChange(appendToken(value, reference.token))}
            >
              <span className="layoutpdf-formula-field-name">{reference.label}</span>
              <small className="layoutpdf-formula-field-key">{reference.token}</small>
            </Button>
          )) : <span className="layoutpdf-panel-note">{t('property.formula.noFields')}</span>}
        </div>
      </section>
      <section>
        <h4>{t('property.formula.arithmetic')}</h4>
        <div className="layoutpdf-formula-tokens">
          {['+', '-', '*', '/', '^', '=', '!=', '<', '<=', '>', '>=', '(', ')', ',']
            .map(token => (
              <Button
                key={token}
                size="compact"
                variant="ghost"
                type="button"
                disabled={disabled}
                onClick={() => onChange(`${value.trim()} ${token}`.trim())}
              >
                {token}
              </Button>
            ))}
        </div>
      </section>
      <FormulaFunctionGuide
        functions={functions}
        references={references}
        currentExpression={value}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}
