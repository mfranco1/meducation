export interface AdminDraftState {
  quizzes: boolean;
  flashcards: boolean;
}
interface StatusSnapshot {
  draft: { basePublicationSequence: string; digests: { quizRevision: string; flashcardRevision: string } };
  publication: { sequence: string; digests: { quizRevision: string; flashcardRevision: string } | null };
}
export function workspaceStatus(snapshot: StatusSnapshot, dirty: AdminDraftState, recovering: boolean) {
  const draftChanged =
    snapshot.draft.digests.quizRevision !== snapshot.publication.digests?.quizRevision ||
    snapshot.draft.digests.flashcardRevision !== snapshot.publication.digests?.flashcardRevision;
  const staleBase = snapshot.draft.basePublicationSequence !== snapshot.publication.sequence;
  const unsaved = dirty.quizzes || dirty.flashcards;
  const publishBlocked = recovering
    ? 'Check save status before publishing.'
    : unsaved
      ? `Save or discard unsaved edits in ${[dirty.quizzes && 'Quizzes', dirty.flashcards && 'Flashcards'].filter(Boolean).join(' and ')} before publishing.`
      : staleBase
        ? 'Reset the draft to the current published version before publishing.'
        : !draftChanged
          ? 'There are no saved draft changes to publish.'
          : '';
  return {
    draftChanged,
    staleBase,
    unsaved,
    publishBlocked,
    label: recovering ? 'Check save status' : unsaved ? 'Unsaved edits' : draftChanged ? 'Draft changes' : 'Up to date',
  };
}
