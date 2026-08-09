/**
 * Primary keys in this codebase are integer columns (`@PrimaryGeneratedColumn()`),
 * so an id can arrive as a JSON number (`1`) or a string (`"1"`). Both helpers
 * normalise ids to strings so validators and repository queries agree on the
 * shape. Empty input becomes `undefined` so optional fields stay optional.
 */
export function toIdString({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value);
}

export function toIdStringArray({ value }: { value: unknown }): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) =>
    item === undefined || item === null || item === ''
      ? undefined
      : String(item),
  );
}
