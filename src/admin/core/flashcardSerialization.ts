import type { StoredFlashcardBank } from '../../content/schema/schema';

export const emptyFlashcardBank: StoredFlashcardBank = { schemaVersion: 2, decks: [], cards: [] };
export function serializeFlashcardBank(value: StoredFlashcardBank): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
