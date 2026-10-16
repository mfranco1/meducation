import { describe, expect, it } from 'vitest';
import { workspaceStatus } from './workspaceStatus';

const snapshot = {
  draft: { basePublicationSequence: '2', digests: { quizRevision: 'q2', flashcardRevision: 'f2' } },
  publication: { sequence: '2', digests: { quizRevision: 'q2', flashcardRevision: 'f2' } },
};
const clean = { quizzes: false, flashcards: false };
describe('workspace status', () => {
  it('distinguishes unsaved text, saved draft and publication independently', () => {
    expect(workspaceStatus(snapshot, clean, false)).toMatchObject({ label: 'Up to date', draftChanged: false });
    const changed = {
      ...snapshot,
      draft: { ...snapshot.draft, digests: { quizRevision: 'q3', flashcardRevision: 'f2' } },
    };
    expect(workspaceStatus(changed, clean, false)).toMatchObject({ label: 'Draft changes', publishBlocked: '' });
    expect(workspaceStatus(changed, { quizzes: false, flashcards: true }, false)).toMatchObject({
      label: 'Unsaved edits',
      draftChanged: true,
    });
    expect(workspaceStatus(changed, { quizzes: true, flashcards: true }, false).publishBlocked).toContain(
      'Quizzes and Flashcards',
    );
    expect(workspaceStatus(changed, { quizzes: true, flashcards: true }, true).label).toBe('Check save status');
  });
  it('blocks publication for stale bases and unchanged drafts, and permits an initial release', () => {
    expect(workspaceStatus(snapshot, clean, false).publishBlocked).toContain('no saved draft changes');
    expect(
      workspaceStatus({ ...snapshot, publication: { ...snapshot.publication, sequence: '3' } }, clean, false)
        .publishBlocked,
    ).toContain('Reset');
    expect(
      workspaceStatus({ ...snapshot, publication: { sequence: '2', digests: null } }, clean, false).publishBlocked,
    ).toBe('');
  });
});
