export interface AdminDraftState {
  quizzes: boolean;
  flashcards: boolean;
}
interface StatusSnapshot {
  changed: boolean;
  baseReleaseId: string | null;
  activeReleaseId: string | null;
}
export function workspaceStatus(snapshot: StatusSnapshot, dirty: AdminDraftState) {
  const unsaved = dirty.quizzes || dirty.flashcards;
  const staleBase =
    snapshot.baseReleaseId !== null &&
    snapshot.activeReleaseId !== null &&
    snapshot.baseReleaseId !== snapshot.activeReleaseId;
  const publishBlocked = unsaved
    ? `Save or discard unsaved edits in ${[dirty.quizzes && 'Quizzes', dirty.flashcards && 'Flashcards'].filter(Boolean).join(' and ')} before publishing.`
    : !snapshot.changed
      ? 'There are no draft changes to publish.'
      : '';
  return {
    draftChanged: snapshot.changed,
    staleBase,
    unsaved,
    publishBlocked,
    label: unsaved ? 'Unsaved edits' : snapshot.changed ? 'Draft changes' : 'Up to date',
  };
}
