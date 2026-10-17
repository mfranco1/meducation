import type { StoredFlashcardBank, StoredTopic } from '../schema/schema';
import { validateFlashcardMarkdown } from './markdownValidation';
import { validateStoredFlashcardBank, type ValidationIssue } from './validate';

/** The same authoring/content gate is used for staging, replay, and canonical validation. */
export function validateFlashcardBank(bank: StoredFlashcardBank, topics: readonly StoredTopic[]): ValidationIssue[] {
  const structural = validateStoredFlashcardBank(bank, topics);
  if (structural.some((issue) => issue.level === 'error')) return structural;
  const warnings: ValidationIssue[] = [];
  for (const records of [bank.decks.map((deck) => [deck.topicId, deck.name])]) {
    const seen = new Set<string>();
    for (const [parent, name] of records) {
      const key = JSON.stringify([parent, name.trim().toLocaleLowerCase()]);
      if (seen.has(key))
        warnings.push({
          level: 'warning',
          message: `Duplicate sibling name “${name}” under ${parent}; records retain distinct IDs.`,
        });
      seen.add(key);
    }
  }
  return [...structural, ...validateFlashcardMarkdown(bank.cards), ...warnings];
}
