import { describe, expect, it } from 'vitest';
import { activeFlashcardSubjects, decksForSubject, flashcardDashboardSubjects } from './flashcards';
import type { FlashcardProgressState } from '../domain/flashcardStudy';
import type { FlashcardDeckSummary, FlashcardSubjectSummary } from '../content/flashcardApiDecoders';

const subjects: FlashcardSubjectSummary[] = [
  { id: 's1', name: 'One', accent: '#111', topicCount: 1, deckCount: 2, deckIds: ['d1', 'd2'] },
  { id: 's2', name: 'Two', accent: '#222', topicCount: 1, deckCount: 1, deckIds: ['d3'] },
  { id: 's3', name: 'Three', accent: '#333', topicCount: 0, deckCount: 0, deckIds: [] },
];
const progress: FlashcardProgressState = {
  schemaVersion: 1, revision: 'r', checkpoints: {
    d1: { deckId: 'd1', currentCardId: 'f1', contentSignature: 'x', updatedAt: '2026-10-01' },
    d3: { deckId: 'd3', currentCardId: 'f3', contentSignature: 'x', updatedAt: '2026-10-03' },
  },
};
const decks = [
  { id: 'd1', topicId: 't1', name: 'One', cardCount: 1, cardIds: ['f1'] },
  { id: 'd2', topicId: 't1', name: 'Two', cardCount: 1, cardIds: ['f2'] },
  { id: 'd3', topicId: 't2', name: 'Three', cardCount: 1, cardIds: ['f3'] },
] as FlashcardDeckSummary[];

describe('flashcard dashboard and deck selectors', () => {
  it('excludes removed or emptied decks from activity while retaining their checkpoints', () => {
    const withEmptyDeck = subjects.map(subject => ({ ...subject, emptyDeckIds: subject.id === 's1' ? ['d1'] : [] }));
    const state = { ...progress, checkpoints: { d1: progress.checkpoints.d1, 'd-removed': { ...progress.checkpoints.d3, deckId: 'd-removed' } } };
    expect(activeFlashcardSubjects(flashcardDashboardSubjects(withEmptyDeck, state))).toEqual([]);
    expect(Object.keys(state.checkpoints)).toEqual(['d1', 'd-removed']);
  });
  it('keeps every canonical subject and orders only active subjects by saved activity', () => {
    const summaries = flashcardDashboardSubjects(subjects, progress);
    expect(summaries.map(item => item.subject.id)).toEqual(['s1', 's2', 's3']);
    expect(activeFlashcardSubjects(summaries).map(item => item.subject.id)).toEqual(['s2', 's1']);
    expect(summaries[0].activeDeckCount).toBe(1);
  });

  it('returns no carousel cards with no checkpoints and one card for one active subject', () => {
    const summaries = flashcardDashboardSubjects(subjects, { schemaVersion: 1, revision: 'empty', checkpoints: {} });
    expect(activeFlashcardSubjects(summaries)).toEqual([]);
    const oneActive = flashcardDashboardSubjects(subjects, {
      schemaVersion: 1, revision: 'one', checkpoints: { d1: progress.checkpoints.d1 },
    });
    expect(activeFlashcardSubjects(oneActive).map(item => item.subject.id)).toEqual(['s1']);
  });

  it('filters by topic and puts resumed decks first while retaining canonical order for ties', () => {
    const ordered = decksForSubject(decks, progress.checkpoints, 't1');
    expect(ordered.map(deck => deck.id)).toEqual(['d1', 'd2']);
    expect(decksForSubject(decks, {}, 't1').map(deck => deck.id)).toEqual(['d1', 'd2']);
  });
});
