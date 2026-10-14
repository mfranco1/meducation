import type { StoredFlashcardBank } from '../../content/schema/schema';
import type { Subject } from '../../domain/types';
import { sha256Text } from '../../domain/contentDigest';

export const emptyFlashcardBank: StoredFlashcardBank = { schemaVersion: 2, decks: [], cards: [] };
export function serializeFlashcardBank(value: StoredFlashcardBank): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
export async function flashcardContentRevision(
  value: StoredFlashcardBank,
  catalog: readonly Subject[],
): Promise<string> {
  return sha256Text(`flashcards-v2\n${JSON.stringify(catalog)}\n${serializeFlashcardBank(value)}`);
}
