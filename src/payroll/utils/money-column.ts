import { Column, ColumnOptions } from 'typeorm';

/**
 * PostgreSQL `numeric(12,2)` column that is surfaced as a JS `number` on read
 * while being stored with exact decimal precision (no floating-point drift).
 * All arithmetic must still be done with a decimal-safe helper (see
 * `src/common/utils/money.util.ts`) before assignment.
 */
export function MoneyColumn(options: ColumnOptions = {}): PropertyDecorator {
  return Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      from: (value) => (value == null ? value : Number(value)),
      to: (value) => (value == null ? value : value),
    },
    ...options,
  });
}
