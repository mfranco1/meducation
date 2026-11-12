import { describe, expect, it } from 'vitest';
import { hasSeenTip, markTipSeen, tipsKey } from './onboardingTips';

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe('onboarding tips', () => {
  it('remembers each seen tip separately', () => {
    const storage = memory();
    expect(hasSeenTip('quiz-keys', storage)).toBe(false);
    markTipSeen('quiz-keys', storage);
    expect(hasSeenTip('quiz-keys', storage)).toBe(true);
    expect(hasSeenTip('backup', storage)).toBe(false);
  });

  it('replaces a malformed list', () => {
    const storage = memory();
    storage.setItem(tipsKey, '{bad');
    markTipSeen('backup', storage);
    expect(hasSeenTip('backup', storage)).toBe(true);
  });

  it('treats unreadable storage as seen', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(hasSeenTip('deck-keys', blocked)).toBe(true);
  });
});
