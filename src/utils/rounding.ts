export type RoundingMode = 'round' | 'up' | 'down' | 'floor' | 'ceil';

const MAX_DECIMAL_PLACES = 10;

/**
 * Removes the binary floating-point residue that shows up after ordinary
 * decimal arithmetic, for example 100 * 1.1 = 110.00000000000001. Fifteen
 * significant digits keeps every value that is exact in IEEE-754 doubles
 * intact while collapsing arithmetic noise.
 */
export function normalizeFloat(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const normalized = Number(value.toPrecision(15));
  return normalized === 0 ? 0 : normalized;
}

/**
 * Shifts the decimal exponent through the string representation so the shift
 * itself does not introduce a new rounding error.
 */
function shiftDecimal(value: number, places: number): number {
  if (value === 0) return 0;
  const [coefficient, exponent = '0'] = value.toString().split('e');
  return Number(`${coefficient}e${Number(exponent) + places}`);
}

/**
 * Rounds a decimal value at `places` digits. The default mode rounds half away
 * from zero (the accounting expectation), and the result is normalised so a
 * rounded value never comes back as negative zero.
 */
export function roundDecimal(
  value: number,
  places = 0,
  mode: RoundingMode = 'round',
): number {
  if (!Number.isFinite(value)) return value;
  const safePlaces = Math.max(0, Math.min(MAX_DECIMAL_PLACES, Math.trunc(places)));
  const scaled = shiftDecimal(normalizeFloat(value), safePlaces);
  let rounded: number;
  if (mode === 'up') {
    rounded = Math.sign(scaled) * Math.ceil(Math.abs(scaled));
  } else if (mode === 'down') {
    rounded = Math.sign(scaled) * Math.floor(Math.abs(scaled));
  } else if (mode === 'floor') {
    rounded = Math.floor(scaled);
  } else if (mode === 'ceil') {
    rounded = Math.ceil(scaled);
  } else {
    rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  }
  const result = shiftDecimal(rounded, -safePlaces);
  return result === 0 ? 0 : result;
}

/**
 * Comparison helper for formulas. It allows a small number of representable
 * doubles of slack so 0.1 + 0.2 compares equal to 0.3, but still treats large
 * monetary values with the expected precision.
 */
export function numbersEqual(left: number, right: number): boolean {
  if (left === right) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 8 * scale;
}

export function isFormulaZero(value: number): boolean {
  return Math.abs(value) <= Number.EPSILON * 8;
}
