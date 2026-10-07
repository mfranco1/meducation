export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const unique = (values: string[]) => new Set(values).size === values.length;

export const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
