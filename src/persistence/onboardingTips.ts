export const tipsKey = 'meducation.tips.v1';

export type TipId = 'quiz-keys' | 'deck-keys' | 'backup';

function readSeen(storage: Pick<Storage, 'getItem'>): string[] {
  const value: unknown = JSON.parse(storage.getItem(tipsKey) ?? '[]');
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** True when the tip was dismissed or acted on in this browser. Unreadable storage counts as seen so a tip never repeats. */
export function hasSeenTip(id: TipId, storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return readSeen(storage).includes(id);
  } catch {
    return true;
  }
}

export function markTipSeen(id: TipId, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  try {
    let seen: string[] = [];
    try {
      seen = readSeen(storage);
    } catch {
      /* Replace a malformed list. */
    }
    if (!seen.includes(id)) storage.setItem(tipsKey, JSON.stringify([...seen, id]));
  } catch {
    /* Tips are a convenience; studying does not depend on remembering them. */
  }
}
