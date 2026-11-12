import {
  evaluateFormulaNode,
  parseFormula,
  type FormulaNode,
} from '@/utils/calc.js';

function isGeometryExpression(node: FormulaNode): boolean {
  if (node.kind === 'number') return true;
  if (node.kind === 'unary') return isGeometryExpression(node.operand);
  if (node.kind === 'binary') {
    return ['+', '-', '*', '/'].includes(node.operator)
      && isGeometryExpression(node.left)
      && isGeometryExpression(node.right);
  }
  return false;
}

/**
 * Property inputs deliberately accept only finite arithmetic. They share the
 * document formula parser/evaluator, but this adapter rejects references,
 * functions, comparisons, and business-only operators in geometry controls.
 */
export function evaluateNumericExpression(source: string): number | undefined {
  if (!source.trim()) return undefined;
  try {
    const node = parseFormula(source);
    if (!isGeometryExpression(node)) return undefined;
    const value = evaluateFormulaNode(node, { resolve: () => undefined });
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
