import {
  formatMessage,
  getCurrentAppLocale,
  type AppLocale,
  type MessageValues,
} from '@/i18n/index.js';
import { getFormulaReferences } from '@/utils/calc.js';

export interface FormulaReferenceOption {
  token: string;
  label: string;
}

export type FormulaFunctionCategory = 'aggregate' | 'rounding' | 'logic' | 'table';

export type FormulaHelpKey =
  | 'wizardTitle'
  | 'wizardHint'
  | 'wizardApply'
  | 'wizardPreview'
  | 'wizardPrimary'
  | 'wizardSecondary'
  | 'wizardOperator'
  | 'wizardTaxRate'
  | 'wizardRounding'
  | 'wizardDecimalPlaces'
  | 'advancedTitle'
  | 'advancedHint'
  | 'recipeMultiply'
  | 'recipeMultiplyHint'
  | 'recipeAddSubtract'
  | 'recipeAddSubtractHint'
  | 'recipeColumnTotal'
  | 'recipeColumnTotalHint'
  | 'recipeTax'
  | 'recipeTaxHint'
  | 'recipeTaxIncluded'
  | 'recipeTaxIncludedHint'
  | 'recipeRowNumber'
  | 'recipeRowNumberHint'
  | 'recipeRunningTotal'
  | 'recipeRunningTotalHint'
  | 'roundingNone'
  | 'guideTitle'
  | 'guideHint'
  | 'aggregate'
  | 'rounding'
  | 'logic'
  | 'table'
  | 'applyExample'
  | 'applyNamedExample'
  | 'applyFunctionExample'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'count'
  | 'round'
  | 'roundup'
  | 'rounddown'
  | 'floor'
  | 'ceil'
  | 'percent'
  | 'abs'
  | 'if'
  | 'rowNumber'
  | 'runningSum'
  | 'errorArray'
  | 'errorDecimalPlaces'
  | 'errorUnknownFunction'
  | 'errorUnknownField'
  | 'errorArguments'
  | 'errorInvalid';

export interface FormulaFunctionHelp {
  category: FormulaFunctionCategory;
  signature: string;
  descriptionKey: FormulaHelpKey;
}

export const FORMULA_FUNCTION_HELP: Record<string, FormulaFunctionHelp> = {
  SUM: { category: 'aggregate', signature: 'SUM(value, ...)', descriptionKey: 'sum' },
  AVERAGE: { category: 'aggregate', signature: 'AVERAGE(value, ...)', descriptionKey: 'average' },
  MIN: { category: 'aggregate', signature: 'MIN(value, ...)', descriptionKey: 'min' },
  MAX: { category: 'aggregate', signature: 'MAX(value, ...)', descriptionKey: 'max' },
  COUNT: { category: 'aggregate', signature: 'COUNT(value, ...)', descriptionKey: 'count' },
  ROUND: { category: 'rounding', signature: 'ROUND(value, decimalPlaces)', descriptionKey: 'round' },
  ROUNDUP: { category: 'rounding', signature: 'ROUNDUP(value, decimalPlaces)', descriptionKey: 'roundup' },
  ROUNDDOWN: { category: 'rounding', signature: 'ROUNDDOWN(value, decimalPlaces)', descriptionKey: 'rounddown' },
  FLOOR: { category: 'rounding', signature: 'FLOOR(value, decimalPlaces)', descriptionKey: 'floor' },
  CEIL: { category: 'rounding', signature: 'CEIL(value, decimalPlaces)', descriptionKey: 'ceil' },
  PERCENT: { category: 'logic', signature: 'PERCENT(percentNumber)', descriptionKey: 'percent' },
  ABS: { category: 'logic', signature: 'ABS(value)', descriptionKey: 'abs' },
  IF: { category: 'logic', signature: 'IF(condition, trueValue, falseValue)', descriptionKey: 'if' },
  ROW_NUMBER: { category: 'table', signature: 'ROW_NUMBER()', descriptionKey: 'rowNumber' },
  RUNNING_SUM: { category: 'table', signature: 'RUNNING_SUM(expression)', descriptionKey: 'runningSum' },
};

export const FORMULA_FUNCTION_CATEGORIES: FormulaFunctionCategory[] = [
  'aggregate',
  'rounding',
  'logic',
  'table',
];

const zhCN: Record<FormulaHelpKey, string> = {
  wizardTitle: '业务公式向导',
  wizardHint: '选择要完成的业务计算，设置字段后即可生成公式。',
  wizardApply: '应用到公式',
  wizardPreview: '计算规则预览',
  wizardPrimary: '计算字段',
  wizardSecondary: '另一个字段',
  wizardOperator: '计算方式',
  wizardTaxRate: '税率（%）',
  wizardRounding: '取整规则',
  wizardDecimalPlaces: '保留小数位',
  advancedTitle: '高级公式',
  advancedHint: '需要自定义规则时，可直接编辑公式或使用下方函数。',
  recipeMultiply: '数量 × 单价',
  recipeMultiplyHint: '计算每行金额或两个字段的乘积',
  recipeAddSubtract: '相加或相减',
  recipeAddSubtractHint: '计算合计、差额或余额',
  recipeColumnTotal: '整列合计',
  recipeColumnTotalHint: '汇总表格中某一列的所有数值',
  recipeTax: '计算税额',
  recipeTaxHint: '按指定税率和取整规则计算税额',
  recipeTaxIncluded: '含税总额',
  recipeTaxIncludedHint: '原金额加上按规则计算的税额',
  recipeRowNumber: '明细序号',
  recipeRowNumberHint: '从 1 开始自动显示当前行序号',
  recipeRunningTotal: '累计金额',
  recipeRunningTotalHint: '从第一行累计到当前行',
  roundingNone: '不取整',
  guideTitle: '按用途选择函数',
  guideHint: '先看使用场景，再点击示例套用到当前公式。',
  aggregate: '汇总与统计',
  rounding: '金额与税额取整',
  logic: '比例、正负值与条件',
  table: '表格行计算',
  applyExample: '套用示例',
  applyNamedExample: '套用“{name}”公式',
  applyFunctionExample: '套用 {name} 示例',
  sum: '合计多个数值或整列金额。用于小计、销售额合计等。',
  average: '计算多个数值的平均值。用于平均单价、平均数量等。',
  min: '找出最小值。用于最低价格、最小数量或最早阈值。',
  max: '找出最大值。用于最高价格、最大数量或上限比较。',
  count: '统计参与计算的数值个数。用于记录数或有效数值数量。',
  round: '按指定小数位四舍五入。普通金额和税额取整优先使用。',
  roundup: '始终远离 0 取整。用于规则要求正数一律进位的税额。',
  rounddown: '始终朝向 0 舍去多余小数。用于规则要求直接截断的金额。',
  floor: '始终向负无穷方向取整。负数结果与 ROUNDDOWN 不同。',
  ceil: '始终向正无穷方向取整。负数结果与 ROUNDUP 不同。',
  percent: '把百分数转换为计算比例。PERCENT(10) 等于 0.1。',
  abs: '去掉正负号并返回绝对值。用于差额大小或距离计算。',
  if: '根据条件选择两个结果之一。用于达标折扣、最低收费等规则。',
  rowNumber: '返回当前明细行序号，从 1 开始。仅用于表格计算列。',
  runningSum: '从第一行累计到当前行。用于余额、累计数量和累计金额。',
  errorArray: '整列不能直接参与此运算，请先用 SUM、AVERAGE、MIN 或 MAX 转换为单个数值。',
  errorDecimalPlaces: '小数位必须是 0–10 的整数。',
  errorUnknownFunction: '公式包含当前场景不支持的函数。',
  errorUnknownField: '公式包含不存在或当前不可用的数据字段。',
  errorArguments: '函数参数数量不正确，请参考下方函数说明和示例。',
  errorInvalid: '公式无效，请检查字段、函数、运算符和括号。',
};

const enUS: Record<FormulaHelpKey, string> = {
  wizardTitle: 'Business formula wizard',
  wizardHint: 'Choose the business calculation, set its fields, and generate the formula.',
  wizardApply: 'Apply to formula',
  wizardPreview: 'Calculation preview',
  wizardPrimary: 'Calculation field',
  wizardSecondary: 'Other field',
  wizardOperator: 'Operation',
  wizardTaxRate: 'Tax rate (%)',
  wizardRounding: 'Rounding rule',
  wizardDecimalPlaces: 'Decimal places',
  advancedTitle: 'Advanced formula',
  advancedHint: 'Edit the expression directly or use the functions below for custom rules.',
  recipeMultiply: 'Quantity × unit price',
  recipeMultiplyHint: 'Calculate a line amount or multiply two fields',
  recipeAddSubtract: 'Add or subtract',
  recipeAddSubtractHint: 'Calculate a total, difference, or balance',
  recipeColumnTotal: 'Column total',
  recipeColumnTotalHint: 'Add all numeric values in a table column',
  recipeTax: 'Tax amount',
  recipeTaxHint: 'Calculate tax with a rate and rounding rule',
  recipeTaxIncluded: 'Tax-inclusive total',
  recipeTaxIncludedHint: 'Add the calculated tax to the source amount',
  recipeRowNumber: 'Line number',
  recipeRowNumberHint: 'Show the current line number starting at 1',
  recipeRunningTotal: 'Running total',
  recipeRunningTotalHint: 'Accumulate from the first row through the current row',
  roundingNone: 'No rounding',
  guideTitle: 'Choose a function by purpose',
  guideHint: 'Review when to use it, then apply its example to the current formula.',
  aggregate: 'Totals and statistics',
  rounding: 'Amount and tax rounding',
  logic: 'Rates, signs, and conditions',
  table: 'Table row calculations',
  applyExample: 'Apply example',
  applyNamedExample: 'Apply “{name}” formula',
  applyFunctionExample: 'Apply {name} example',
  sum: 'Adds values or an entire numeric column. Use it for subtotals and sales totals.',
  average: 'Calculates the average of values. Use it for average price or quantity.',
  min: 'Returns the smallest value. Use it for minimum prices, quantities, or thresholds.',
  max: 'Returns the largest value. Use it for maximum prices, quantities, or limit checks.',
  count: 'Counts numeric values included in the calculation. Use it for record or value counts.',
  round: 'Rounds normally to the specified decimal places. Use it for standard amount or tax rounding.',
  roundup: 'Always rounds away from zero. Use it when positive tax must always round up.',
  rounddown: 'Always rounds toward zero. Use it when extra decimals must be truncated.',
  floor: 'Always rounds toward negative infinity. Negative results differ from ROUNDDOWN.',
  ceil: 'Always rounds toward positive infinity. Negative results differ from ROUNDUP.',
  percent: 'Converts a percent number to a calculation rate. PERCENT(10) equals 0.1.',
  abs: 'Removes the sign and returns an absolute value. Use it for difference size or distance.',
  if: 'Chooses one of two results from a condition. Use it for discounts or minimum charges.',
  rowNumber: 'Returns the current line-item number starting at 1. Available only in table formula columns.',
  runningSum: 'Accumulates from the first row through the current row. Use it for balances and running totals.',
  errorArray: 'A whole column cannot be used directly here. Convert it to one value with SUM, AVERAGE, MIN, or MAX first.',
  errorDecimalPlaces: 'Decimal places must be an integer from 0 to 10.',
  errorUnknownFunction: 'The formula contains a function that is unavailable in this context.',
  errorUnknownField: 'The formula contains a missing or unavailable data field.',
  errorArguments: 'The function has the wrong number of arguments. Review its guide and example below.',
  errorInvalid: 'The formula is invalid. Check its fields, functions, operators, and parentheses.',
};

const jaJP: Record<FormulaHelpKey, string> = {
  wizardTitle: '業務数式ウィザード',
  wizardHint: '業務計算を選び、フィールドを設定すると数式を生成できます。',
  wizardApply: '数式に適用',
  wizardPreview: '計算ルールのプレビュー',
  wizardPrimary: '計算フィールド',
  wizardSecondary: 'もう一つのフィールド',
  wizardOperator: '計算方法',
  wizardTaxRate: '税率（%）',
  wizardRounding: '丸め規則',
  wizardDecimalPlaces: '小数桁',
  advancedTitle: '高度な数式',
  advancedHint: '独自のルールが必要な場合は、数式を直接編集するか下の関数を使用します。',
  recipeMultiply: '数量 × 単価',
  recipeMultiplyHint: '明細金額または2つのフィールドの積を計算',
  recipeAddSubtract: '加算または減算',
  recipeAddSubtractHint: '合計、差額、残高を計算',
  recipeColumnTotal: '列の合計',
  recipeColumnTotalHint: 'テーブル列のすべての数値を合計',
  recipeTax: '税額を計算',
  recipeTaxHint: '税率と丸め規則を指定して税額を計算',
  recipeTaxIncluded: '税込合計',
  recipeTaxIncludedHint: '元の金額に計算した税額を加算',
  recipeRowNumber: '明細番号',
  recipeRowNumberHint: '1から始まる現在の行番号を表示',
  recipeRunningTotal: '累計金額',
  recipeRunningTotalHint: '先頭行から現在行まで累計',
  roundingNone: '丸めない',
  guideTitle: '用途から関数を選ぶ',
  guideHint: '利用場面を確認してから、例を現在の数式に適用できます。',
  aggregate: '集計と統計',
  rounding: '金額と税額の丸め',
  logic: '割合・符号・条件',
  table: 'テーブル行の計算',
  applyExample: '例を適用',
  applyNamedExample: '「{name}」の数式を適用',
  applyFunctionExample: '{name} の例を適用',
  sum: '複数の数値または列全体を合計します。小計や売上合計に使用します。',
  average: '複数の数値の平均を計算します。平均単価や平均数量に使用します。',
  min: '最小値を返します。最低価格、最小数量、しきい値に使用します。',
  max: '最大値を返します。最高価格、最大数量、上限比較に使用します。',
  count: '計算対象の数値の個数を数えます。レコード数や有効値の件数に使用します。',
  round: '指定した小数桁で四捨五入します。通常の金額や税額の丸めに使用します。',
  roundup: '常に 0 から離れる方向へ丸めます。正の税額を必ず切り上げる規則に使用します。',
  rounddown: '常に 0 に近づく方向へ丸めます。余分な小数を切り捨てる規則に使用します。',
  floor: '常に負の無限大方向へ丸めます。負数の結果は ROUNDDOWN と異なります。',
  ceil: '常に正の無限大方向へ丸めます。負数の結果は ROUNDUP と異なります。',
  percent: 'パーセント数を計算用の割合に変換します。PERCENT(10) は 0.1 です。',
  abs: '符号を除いて絶対値を返します。差額の大きさや距離の計算に使用します。',
  if: '条件によって2つの結果から選択します。割引や最低料金の規則に使用します。',
  rowNumber: '1 から始まる現在の明細行番号を返します。テーブル計算列でのみ使用できます。',
  runningSum: '先頭行から現在行まで累計します。残高、累計数量、累計金額に使用します。',
  errorArray: '列全体をこの演算に直接使用できません。先に SUM、AVERAGE、MIN、MAX で1つの値に変換してください。',
  errorDecimalPlaces: '小数桁は 0～10 の整数で指定してください。',
  errorUnknownFunction: '現在の場面では使用できない関数が含まれています。',
  errorUnknownField: '存在しない、または現在使用できないデータフィールドが含まれています。',
  errorArguments: '関数の引数の数が正しくありません。下の説明と例を確認してください。',
  errorInvalid: '数式が無効です。フィールド、関数、演算子、括弧を確認してください。',
};

const catalogs: Record<AppLocale, Record<FormulaHelpKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
};

export function formulaHelpText(
  key: FormulaHelpKey,
  values?: MessageValues,
): string {
  return formatMessage(catalogs[getCurrentAppLocale()][key], values);
}

export function formatFormulaValidationError(error: unknown): string {
  if (!(error instanceof Error)) return formulaHelpText('errorInvalid');
  if (/requires a single numeric value/.test(error.message)) return formulaHelpText('errorArray');
  if (/decimal places must be an integer/.test(error.message)) {
    return formulaHelpText('errorDecimalPlaces');
  }
  if (/Unknown formula function/.test(error.message)) return formulaHelpText('errorUnknownFunction');
  if (/Unknown formula field/.test(error.message)) return formulaHelpText('errorUnknownField');
  if (/requires .* arguments?/.test(error.message)) return formulaHelpText('errorArguments');
  return formulaHelpText('errorInvalid');
}

function preferredFormulaReference(
  references: FormulaReferenceOption[],
  currentExpression: string,
): FormulaReferenceOption | undefined {
  let currentReferences = new Set<string>();
  try {
    currentReferences = new Set(getFormulaReferences(currentExpression));
  } catch {
    // Fall back to the available business fields while the expression is incomplete.
  }
  return references.find(reference => currentReferences.has(reference.token))
    ?? references.find(reference => reference.token.startsWith('row.'))
    ?? references.find(reference => reference.token.startsWith('column.'))
    ?? references[0];
}

export function buildFormulaFunctionExample(
  name: string,
  references: FormulaReferenceOption[],
  currentExpression: string,
): string {
  const preferred = preferredFormulaReference(references, currentExpression);
  const scalar = preferred?.token.startsWith('column.')
    ? `SUM(${preferred.token})`
    : preferred?.token ?? '0';
  const collection = preferred?.token ?? '0';
  const row = references.find(reference => reference.token.startsWith('row.'))?.token
    ?? scalar;
  if (['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'].includes(name)) return `${name}(${collection})`;
  if (name === 'ROUND') return `ROUND(${scalar}, 2)`;
  if (['ROUNDUP', 'ROUNDDOWN', 'FLOOR', 'CEIL'].includes(name)) return `${name}(${scalar}, 0)`;
  if (name === 'PERCENT') return 'PERCENT(10)';
  if (name === 'ABS') return `ABS(${scalar})`;
  if (name === 'IF') return `IF(${scalar} > 0, ${scalar}, 0)`;
  if (name === 'ROW_NUMBER') return 'ROW_NUMBER()';
  if (name === 'RUNNING_SUM') return `RUNNING_SUM(${row})`;
  return `${name}(`;
}
