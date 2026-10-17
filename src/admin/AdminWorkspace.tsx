import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, Tab, Tabs, Container } from '@mui/material';
import { AppShell } from '../shared/ui/shell/AppShell';
import { AdminDeleteDialog, type DeleteRequest } from './components/AdminDeleteDialog';
import { QuizAdminPanel } from './QuizAdminPanel';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { SubjectEditorDialog } from './SubjectEditorDialog';
import { errorMessages } from './data/PairedHttpClient';
import type { DraftStore } from './data/DraftStore';
import type { AdminDraftState } from './core/workspaceStatus';

/** Both banks over one loaded draft: quizzes and flashcards share subjects, deletion and the unsaved-text report. */
export function AdminWorkspace({
  store,
  header,
  feedback,
  externalBusy = false,
  onDirtyChange,
}: {
  store: DraftStore;
  header?: ReactNode;
  feedback?: ReactNode;
  externalBusy?: boolean;
  onDirtyChange?: (dirty: AdminDraftState) => void;
}) {
  const [section, setSection] = useState<'quizzes' | 'flashcards'>('quizzes');
  const [subjectTarget, setSubjectTarget] = useState<{ id?: string }>();
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [quizzesDirty, setQuizzesDirty] = useState(false);
  const [flashcardsDirty, setFlashcardsDirty] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>();
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((value) => value + 1)), [store]);
  const busy = externalBusy || deleting;
  useEffect(() => {
    onDirtyChange?.({ quizzes: quizzesDirty || subjectDirty, flashcards: flashcardsDirty || subjectDirty });
  }, [quizzesDirty, flashcardsDirty, subjectDirty, onDirtyChange]);
  const openSubject = (id?: string) => {
    if (!busy) setSubjectTarget({ id });
  };
  const requestDelete = useCallback((request: DeleteRequest) => {
    setDeleteError('');
    setDeleteRequest(request);
  }, []);
  const confirmDelete = async () => {
    if (!deleteRequest || busy) return;
    const { selection, ids } = deleteRequest;
    const records = (ids ?? [selection.id ?? '']).flatMap((id) => {
      const record = store.find(selection.kind, id);
      return record ? [{ id, version: record.version }] : [];
    });
    if (!records.length) {
      setDeleteError('The record no longer exists. Close this dialog and review the current content.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await store.remove(selection.kind, records, true);
      setDeleteRequest(undefined);
    } catch (error) {
      setDeleteError(errorMessages(error).join(' '));
    } finally {
      setDeleting(false);
    }
  };
  const subjectName = (id: string) => store.quizBank.subjects.find((row) => row.id === id)?.name ?? id;
  return (
    <AppShell header={header}>
      {feedback}
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Tabs value={section} onChange={(_, value) => setSection(value)} aria-label="Content workspace" sx={{ mb: 2 }}>
          <Tab
            value="quizzes"
            id="quizzes-tab"
            aria-controls="quizzes-panel"
            aria-label="Quizzes"
            aria-describedby={quizzesDirty || subjectDirty ? 'quizzes-unsaved' : undefined}
            label={<>Quizzes{(quizzesDirty || subjectDirty) && <span id="quizzes-unsaved"> • Unsaved</span>}</>}
          />
          <Tab
            value="flashcards"
            id="flashcards-tab"
            aria-controls="flashcards-panel"
            aria-label="Flashcards"
            aria-describedby={flashcardsDirty || subjectDirty ? 'flashcards-unsaved' : undefined}
            label={<>Flashcards{(flashcardsDirty || subjectDirty) && <span id="flashcards-unsaved"> • Unsaved</span>}</>}
          />
        </Tabs>
        <Box role="tabpanel" id="quizzes-panel" aria-labelledby="quizzes-tab" hidden={section !== 'quizzes'}>
          <QuizAdminPanel
            store={store}
            blocked={busy}
            onDelete={requestDelete}
            onManageSubjects={openSubject}
            onDirtyChange={setQuizzesDirty}
          />
        </Box>
        <Box role="tabpanel" id="flashcards-panel" aria-labelledby="flashcards-tab" hidden={section !== 'flashcards'}>
          <FlashcardAdminPanel
            store={store}
            blocked={busy}
            onDelete={requestDelete}
            onAddSubject={() => openSubject()}
            onManageSubjects={openSubject}
            onEditSubject={openSubject}
            onDeleteSubject={(id) => requestDelete({ selection: { kind: 'subject', id }, label: subjectName(id) })}
            onDirtyChange={setFlashcardsDirty}
          />
        </Box>
        {subjectTarget && (
          <SubjectEditorDialog
            key={subjectTarget.id ?? 'new'}
            store={store}
            initialId={subjectTarget.id}
            blocked={busy}
            onDirtyChange={setSubjectDirty}
            onClose={() => setSubjectTarget(undefined)}
          />
        )}
        <AdminDeleteDialog
          busy={busy}
          request={deleteRequest}
          bank={store.quizBank}
          flashcardBank={store.flashcardBank}
          error={deleteError}
          onClose={() => {
            setDeleteRequest(undefined);
            setDeleteError('');
          }}
          onConfirm={() => void confirmDelete()}
        />
      </Container>
    </AppShell>
  );
}
