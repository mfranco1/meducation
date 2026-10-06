import { describe, expect, it } from 'vitest';
import { flashcardContentRevision, flashcardRepository, serializeFlashcardBank, storedFlashcardBank } from './flashcardBank';
import type { StoredFlashcardBank, StoredSubject } from './schema';
import fixture from '../../tests/fixtures/flashcard-bank-contract.json';

describe('flashcard content adapter', () => {
  it('exposes shared quiz subjects and empty ordered catalogs', () => {
    expect(flashcardRepository.listSubjects()).toHaveLength(13);
    expect(flashcardRepository.listTopics('s1')).toEqual([]);
    expect(flashcardRepository.listDecks('s1')).toEqual([]);
    expect(flashcardRepository.listCards('d1')).toEqual([]);
  });

  it('serializes deterministically and derives a SHA-256 revision', async () => {
    const first = serializeFlashcardBank(storedFlashcardBank);
    expect(serializeFlashcardBank(JSON.parse(first))).toBe(first);
    expect(await flashcardContentRevision(storedFlashcardBank)).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  it('matches the Python content service revision serialization', async () => {
    await expect(flashcardContentRevision(fixture.bank as StoredFlashcardBank, fixture.subjects as StoredSubject[])).resolves.toBe('sha256-a601a3fb3815d69a237aabff72005a5b286b3de3e04e12d918c1611a8104bd10');
  });
});
