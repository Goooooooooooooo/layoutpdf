import type { FormulaReferenceOption } from './formulaHelp.js';

export type BusinessFormulaRecipeId =
  | 'multiply'
  | 'addSubtract'
  | 'columnTotal'
  | 'tax'
  | 'taxIncluded'
  | 'rowNumber'
  | 'runningTotal';

export type BusinessFormulaRoundingFunction =
  | 'ROUND'
  | 'ROUNDUP'
  | 'ROUNDDOWN'
  | 'FLOOR'
  | 'CEIL';

export interface BusinessFormulaDraft {
  recipe: BusinessFormulaRecipeId;
  primaryReference?: string;
  secondaryReference?: string;
  operator?: '+' | '-';
  percent?: number;
  roundingFunction?: BusinessFormulaRoundingFunction;
  decimalPlaces?: number;
}

const ROUNDING_FUNCTIONS: BusinessFormulaRoundingFunction[] = [
  'ROUND',
  'ROUNDUP',
  'ROUNDDOWN',
  'FLOOR',
  'CEIL',
];

export function availableBusinessFormulaRecipes(
  references: FormulaReferenceOption[],
  functions: string[],
): BusinessFormulaRecipeId[] {
  const recipes: BusinessFormulaRecipeId[] = [];
  const scalarReferences = references.filter(reference => !reference.token.startsWith('column.'));
  const columnReferences = references.filter(reference => reference.token.startsWith('column.'));
  const rowReferences = references.filter(reference => reference.token.startsWith('row.'));
  if (scalarReferences.length >= 2) recipes.push('multiply', 'addSubtract');
  if (columnReferences.length > 0 && functions.includes('SUM')) recipes.push('columnTotal');
  if (references.length > 0 && functions.includes('PERCENT')) recipes.push('tax', 'taxIncluded');
  if (functions.includes('ROW_NUMBER')) recipes.push('rowNumber');
  if (rowReferences.length > 0 && functions.includes('RUNNING_SUM')) recipes.push('runningTotal');
  return recipes;
}

export function availableBusinessFormulaRoundingFunctions(
  functions: string[],
): BusinessFormulaRoundingFunction[] {
  return ROUNDING_FUNCTIONS.filter(name => functions.includes(name));
}

function scalarExpression(reference: string): string {
  return reference.startsWith('column.') ? `SUM(${reference})` : reference;
}

function roundedExpression(
  expression: string,
  roundingFunction: BusinessFormulaRoundingFunction | undefined,
  decimalPlaces: number | undefined,
): string {
  if (!roundingFunction) return expression;
  const places = Math.max(0, Math.min(10, Math.trunc(decimalPlaces ?? 0)));
  return `${roundingFunction}(${expression}, ${places})`;
}

export function buildBusinessFormula(draft: BusinessFormulaDraft): string {
  const primary = draft.primaryReference ?? '0';
  const secondary = draft.secondaryReference ?? '0';
  const rate = Number.isFinite(draft.percent) ? Math.max(0, draft.percent ?? 0) : 0;
  const tax = roundedExpression(
    `${scalarExpression(primary)} * PERCENT(${rate})`,
    draft.roundingFunction,
    draft.decimalPlaces,
  );

  switch (draft.recipe) {
    case 'multiply':
      return `${scalarExpression(primary)} * ${scalarExpression(secondary)}`;
    case 'addSubtract':
      return `${scalarExpression(primary)} ${draft.operator ?? '+'} ${scalarExpression(secondary)}`;
    case 'columnTotal':
      return `SUM(${primary})`;
    case 'tax':
      return tax;
    case 'taxIncluded':
      return `${scalarExpression(primary)} + ${tax}`;
    case 'rowNumber':
      return 'ROW_NUMBER()';
    case 'runningTotal':
      return `RUNNING_SUM(${primary})`;
  }
}
