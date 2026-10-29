import { describe, expect, it } from 'vitest';
import { progressKey } from './progressCodec';
import { hasStartedStudying, markStartedStudying } from './visitorStart';

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }; };

describe('visitor start flag', () => {
  it('is false on empty storage and true after the visitor starts', () => {
    const storage = memory();
    expect(hasStartedStudying(storage)).toBe(false);
    markStartedStudying(storage);
    expect(hasStartedStudying(storage)).toBe(true);
  });

  it('is true for a visitor with saved progress', () => {
    const storage = memory();
    storage.setItem(progressKey, '{}');
    expect(hasStartedStudying(storage)).toBe(true);
  });

  it('is false when storage is unavailable', () => {
    expect(hasStartedStudying({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});
