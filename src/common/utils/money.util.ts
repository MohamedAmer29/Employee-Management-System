import Decimal from 'decimal.js';

const SCALE = 2;

function d(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** Round to 2 decimal places using half-up rounding. */
export function roundMoney(value: Decimal.Value): Decimal {
  return d(value).toDecimalPlaces(SCALE, Decimal.ROUND_HALF_UP);
}

/**
 * Safe division for monetary values: `numerator / denominator`, rounded to 2dp.
 * Avoids JavaScript floating-point drift. Returns 0 when dividing by zero.
 */
export function divideMoney(
  numerator: Decimal.Value,
  denominator: Decimal.Value,
): number {
  if (d(denominator).isZero()) {
    return 0;
  }
  return roundMoney(d(numerator).div(d(denominator))).toNumber();
}

/** Safe multiplication for monetary values, rounded to 2dp. */
export function multiplyMoney(
  value: Decimal.Value,
  factor: Decimal.Value,
): number {
  return roundMoney(d(value).times(d(factor))).toNumber();
}

/** Safe sum of monetary values, rounded to 2dp. */
export function addMoney(...values: Decimal.Value[]): number {
  const total = values.reduce<Decimal>(
    (acc, v) => acc.plus(d(v)),
    new Decimal(0),
  );
  return roundMoney(total).toNumber();
}
