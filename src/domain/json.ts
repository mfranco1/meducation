export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const nonBlank = (value: unknown): value is string => isString(value) && value.trim().length > 0;

export const unique = (values: string[]) => new Set(values).size === values.length;

export const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
