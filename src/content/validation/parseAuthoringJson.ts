import limits from './authoringLimits.json';

export class AuthoringJsonError extends Error {
  constructor(readonly code: string) { super('Authoring JSON was rejected.'); }
}

/** JSON.parse supplies syntax semantics; the token pass rejects duplicate keys first. */
export function parseAuthoringJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > limits.requestBytes) throw new AuthoringJsonError('body_limit');
  const stack: Array<{ object: boolean; key: boolean; keys: Set<string> }> = [];
  for (const token of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}[\],:]/g)) {
    const value = token[0];
    if (value === '{' || value === '[') {
      stack.push({ object: value === '{', key: value === '{', keys: new Set() });
      if (stack.length > limits.maxDepth + 1) throw new AuthoringJsonError('depth_limit');
    } else if (value === '}' || value === ']') stack.pop();
    else if (value === ',' && stack.at(-1)?.object) stack.at(-1)!.key = true;
    else if (value.startsWith('"') && stack.at(-1)?.key) {
      let key: string;
      try { key = JSON.parse(value); } catch { throw new AuthoringJsonError('invalid_json'); }
      const scope = stack.at(-1)!;
      if (scope.keys.has(key)) throw new AuthoringJsonError('duplicate_key');
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new AuthoringJsonError('dangerous_key');
      scope.keys.add(key); scope.key = false;
    }
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AuthoringJsonError('invalid_json'); }
  const check = (item: unknown): void => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new AuthoringJsonError('invalid_number');
    if (typeof item === 'string' && item.includes('\0')) throw new AuthoringJsonError('invalid_text');
    if (typeof item === 'string' && /[\uD800-\uDFFF]/u.test(item)) throw new AuthoringJsonError('invalid_unicode');
    if (Array.isArray(item)) item.forEach(check);
    else if (item !== null && typeof item === 'object') Object.values(item).forEach(check);
  };
  check(value);
  return value;
}
