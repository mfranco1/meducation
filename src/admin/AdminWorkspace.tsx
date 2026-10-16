import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Container,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { AppShell } from '../shared/ui/shell/AppShell';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
import { adminEditorLayout } from './components/adminPanelLayout';
import { AdminNavigatorPanel } from './components/AdminNavigatorPanel';
import { AdminStatusPanel } from './components/AdminStatusPanel';
import { AdminDeleteDialog, type DeleteRequest } from './components/AdminDeleteDialog';
import { HttpQuestionBankGateway } from './data/HttpQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { applyFlashcardOperations, type FlashcardAdminOperation } from './core/flashcardChangeSet';
import { parseChangeSet } from './core/changeSetSchema';
import type { AdminDraftState } from './core/workspaceStatus';

export function AdminWorkspace({
  gateway,
  header,
  feedback,
  onDirtyChange,
}: {
  gateway: HttpQuestionBankGateway;
  header?: ReactNode;
  feedback?: ReactNode;
  onDirtyChange?: (dirty: AdminDraftState) => void;
}) {
  const [section, setSection] = useState<'quizzes' | 'flashcards'>('quizzes');
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>();
  const [flashcardDiscardRequest, setFlashcardDiscardRequest] = useState(0);
  const [deleteReason, setDeleteReason] = useState('Remove obsolete content');
  const [deleteError, setDeleteError] = useState('');
  const [flashcardDirty, setFlashcardDirty] = useState(false);
  const flashcardDraft = useRef(false);
  const reportFlashcardDirty = useCallback((dirty: boolean) => {
    flashcardDraft.current = dirty;
    setFlashcardDirty(dirty);
  }, []);
  const [bulkSubjectQuery, setBulkSubjectQuery] = useState<string>();
  const [bulkQuizQuery, setBulkQuizQuery] = useState<string>();
  const [recordAnchor, setRecordAnchor] = useState<HTMLElement | null>(null);
  const {
    snapshot,
    selection,
    mode,
    editor,
    reason,
    issues,
    summary,
    editorDirty,
    filter,
    setFilter,
    pendingBulk,
    bulkTarget,
    busy,
    loadError,
    selectedQuiz,
    selectedSubject,
    loadEntity,
    loadNew,
    chooseBulkTarget,
    chooseBulkSubject,
    chooseBulkQuiz,
    showSingle,
    editRecord,
    editReason,
    stageSingle,
    validateBulkDraft,
    stageValidatedBulk,
    stageDelete,
    browseContext,
    savePairedChange,
  } = useAdminEditor(gateway);
  useEffect(() => {
    onDirtyChange?.({ quizzes: editorDirty, flashcards: flashcardDirty });
  }, [editorDirty, flashcardDirty, onDirtyChange]);
  const bulkSubjectId = bulkTarget.kind === 'newSubject' ? undefined : bulkTarget.subjectId;
  const bulkSubject = snapshot?.bank.subjects.find((subject) => subject.id === bulkSubjectId);
  const bulkQuizzes = useMemo(
    () => (!snapshot || !bulkSubjectId ? [] : snapshot.bank.quizzes.filter((quiz) => quiz.subjectId === bulkSubjectId)),
    [snapshot, bulkSubjectId],
  );
  const bulkQuizId = bulkTarget.kind === 'quiz' ? bulkTarget.quizId : undefined;
  const bulkQuiz = snapshot?.bank.quizzes.find((quiz) => quiz.id === bulkQuizId);
  const pendingBulkCurrent = Boolean(pendingBulk && pendingBulk.changeSet.base.revision === snapshot?.revision);

  const bulkTargetLabel =
    bulkTarget.kind === 'newSubject'
      ? 'New subject'
      : bulkTarget.kind === 'subject'
        ? (bulkSubject?.name ?? 'Choose a subject')
        : bulkSubject && bulkQuiz
          ? `${bulkSubject.name} / ${bulkQuiz.name}`
          : (bulkSubject?.name ?? 'Choose a subject and quiz');

  const deletionKey =
    snapshot && deleteRequest ? JSON.stringify([snapshot.bank, snapshot.flashcards ?? gateway.getFlashcardBank()]) : '';
  const requestDelete = (selection: DeleteRequest['selection'], label: string, ids?: string[]) => {
    if (!snapshot || busy) return;
    setDeleteReason(reason);
    setDeleteError('');
    setDeleteRequest({
      selection,
      label,
      ids,
      reviewKey: JSON.stringify([snapshot.bank, snapshot.flashcards ?? gateway.getFlashcardBank()]),
    });
  };
  const confirmDelete = async () => {
    const request = deleteRequest;
    if (!request || !snapshot || busy) return;
    if (request.reviewKey !== deletionKey) {
      setDeleteError('The content changed. Cancel and review the deletion again.');
      return;
    }
    if (request.selection.kind === 'deck' || request.selection.kind === 'card') return;
    if (request.selection.kind !== 'subject') {
      const staged = await stageDelete(
        { ...request.selection, kind: request.selection.kind },
        deleteReason,
        request.ids,
        snapshot.revision,
      );
      if (staged) setDeleteRequest(undefined);
      else setDeleteError('The deletion did not pass validation. No changes were saved.');
      return;
    }
    const parentId = request.selection.id;
    if (!parentId) return;
    try {
      if (
        flashcardDraft.current &&
        !window.confirm('Discard the unstaged flashcard drafts and save the paired subject deletion?')
      )
        return;
      const savedFlashcards = gateway.getFlashcardBank();
      const childDecks = savedFlashcards.decks.filter((deck) => deck.subjectId === parentId);
      const cascades: FlashcardAdminOperation[] = childDecks.map((deck) => ({
        op: 'deck.delete',
        id: deck.id,
        cascade: true,
      }));
      const flashcards = applyFlashcardOperations(savedFlashcards, snapshot.bank.subjects, cascades);
      const parsed = parseChangeSet({
        changeSetVersion: 2,
        base: { bankSchemaVersion: 4, revision: snapshot.revision },
        reason: deleteReason,
        operations: [{ op: 'subject.delete', id: parentId, cascade: true }],
      });
      if (!parsed.changeSet) throw new Error('The subject deletion could not be prepared.');
      await savePairedChange(parsed.changeSet, flashcards);
      setFlashcardDiscardRequest((value) => value + 1);
      setDeleteError('');
      setDeleteRequest(undefined);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The paired subject deletion could not be saved.');
    }
  };

  return (
    <AppShell header={header} busy={Boolean(!snapshot && !loadError)}>
      {feedback}
      {!snapshot ? (
        loadError ? (
          <Container sx={{ py: 8 }}>
            <Alert severity="error">{loadError}</Alert>
          </Container>
        ) : (
          <ScreenLoading label="Loading question bank…" />
        )
      ) : (
        <Container maxWidth={false} sx={{ py: 2 }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Button
              aria-label="Quizzes"
              aria-describedby={editorDirty ? 'quizzes-unsaved' : undefined}
              variant={section === 'quizzes' ? 'contained' : 'outlined'}
              onClick={() => setSection('quizzes')}
            >
              Quizzes{editorDirty && <span id="quizzes-unsaved"> • Unsaved</span>}
            </Button>
            <Button
              aria-label="Flashcards"
              aria-describedby={flashcardDirty ? 'flashcards-unsaved' : undefined}
              variant={section === 'flashcards' ? 'contained' : 'outlined'}
              onClick={() => setSection('flashcards')}
            >
              Flashcards{flashcardDirty && <span id="flashcards-unsaved"> • Unsaved</span>}
            </Button>
          </Stack>
          <Box sx={{ display: section === 'flashcards' ? 'block' : 'none' }}>
            <FlashcardAdminPanel
              discardRequest={flashcardDiscardRequest}
              serverBank={snapshot.flashcards!}
              onSaveBank={(bank, reason) => gateway.saveFlashcards(bank, reason)}
              onDraftChange={reportFlashcardDirty}
              subjects={snapshot.bank.subjects}
              onAddSubject={() => {
                setSection('quizzes');
                loadNew('subject');
              }}
              onEditSubject={(id) => {
                const subject = snapshot.bank.subjects.find((item) => item.id === id);
                if (subject) {
                  setSection('quizzes');
                  loadEntity({ kind: 'subject', id }, subject);
                }
              }}
              onDeleteSubject={(id, name) => requestDelete({ kind: 'subject', id }, name)}
              quizRevision={snapshot.revision}
              externalBusy={Boolean(busy)}
            />
          </Box>
          {section === 'quizzes' && (
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
              <AdminNavigatorPanel
                onBrowseChange={browseContext}
                bank={snapshot.bank}
                selection={selection}
                selectedSubjectId={selectedSubject?.id}
                selectedQuizId={selectedQuiz?.id}
                filter={filter}
                setFilter={setFilter}
                loadEntity={loadEntity}
                loadNew={loadNew}
                chooseBulkTarget={chooseBulkTarget}
                onDelete={requestDelete}
                onDeleteItems={(ids) =>
                  requestDelete({ kind: 'question', parentId: selectedQuiz?.id }, `${ids.length} selected items`, ids)
                }
              />
              <Paper
                component="section"
                aria-label="Quiz editor"
                variant="outlined"
                sx={{ ...adminEditorLayout, p: 2 }}
              >
                <Tabs
                  value={mode}
                  onChange={(_, value) => {
                    if (value === 'bulk')
                      chooseBulkTarget(
                        selection.kind === 'question' || selection.kind === 'quiz'
                          ? 'quiz'
                          : selection.kind === 'subject' && selection.id
                            ? 'subject'
                            : 'newSubject',
                      );
                    else showSingle();
                  }}
                >
                  <Tab value="single" label="Record" />
                  <Tab value="bulk" label="Add" />
                </Tabs>
                {mode === 'bulk' && (
                  <TextField
                    select
                    label="Destination"
                    value={bulkTarget.kind}
                    onChange={(event) => chooseBulkTarget(event.target.value as 'newSubject' | 'subject' | 'quiz')}
                    fullWidth
                    sx={{ mt: 2 }}
                  >
                    <MenuItem value="newSubject">Create a subject and quizzes</MenuItem>
                    <MenuItem value="subject">Add quizzes to a subject</MenuItem>
                    <MenuItem value="quiz">Add items to a quiz</MenuItem>
                  </TextField>
                )}
                <Stack spacing={2} sx={{ mt: 2 }}>
                  {mode === 'bulk' && bulkTarget.kind !== 'newSubject' && (
                    <Autocomplete
                      inputValue={bulkSubjectQuery ?? (bulkSubject ? `${bulkSubject.name} · ${bulkSubject.id}` : '')}
                      onInputChange={(_, value, reason) => {
                        if (reason === 'input') setBulkSubjectQuery(value);
                      }}
                      options={snapshot.bank.subjects}
                      value={bulkSubject ?? null}
                      getOptionLabel={(subject) => `${subject.name} · ${subject.id}`}
                      isOptionEqualToValue={(left, right) => left.id === right.id}
                      onChange={(_, subject) => {
                        chooseBulkSubject(subject?.id ?? '');
                        setBulkSubjectQuery(undefined);
                        setBulkQuizQuery(undefined);
                      }}
                      renderInput={(params) => <TextField {...params} label="Subject" />}
                    />
                  )}
                  {mode === 'bulk' && bulkTarget.kind === 'quiz' && (
                    <Autocomplete
                      inputValue={bulkQuizQuery ?? (bulkQuiz ? `${bulkQuiz.name} · ${bulkQuiz.id}` : '')}
                      onInputChange={(_, value, reason) => {
                        if (reason === 'input') setBulkQuizQuery(value);
                      }}
                      options={bulkQuizzes}
                      value={bulkQuiz ?? null}
                      disabled={!bulkTarget.subjectId}
                      getOptionLabel={(quiz) => `${quiz.name} · ${quiz.id}`}
                      isOptionEqualToValue={(left, right) => left.id === right.id}
                      onChange={(_, quiz) => {
                        chooseBulkQuiz(quiz?.id ?? '');
                        setBulkQuizQuery(undefined);
                      }}
                      renderInput={(params) => <TextField {...params} label="Quiz" />}
                    />
                  )}
                  {mode === 'bulk' && (
                    <Typography variant="body2" color="text.secondary">
                      {bulkTargetLabel}
                    </Typography>
                  )}
                  <TextField
                    label="Change reason"
                    value={reason}
                    onChange={(event) => editReason(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="JSON"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ mt: 1 }}
                    value={editor}
                    onChange={(event) => editRecord(event.target.value)}
                    multiline
                    minRows={16}
                    maxRows={24}
                    fullWidth
                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
                    placeholder={
                      mode === 'single'
                        ? 'Select an entity or create a template.'
                        : 'Edit subject, quiz, and item content.'
                    }
                  />
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Button
                      variant="contained"
                      disabled={Boolean(busy) || (mode === 'single' && !editor.trim())}
                      onClick={
                        mode === 'single' ? stageSingle : pendingBulkCurrent ? stageValidatedBulk : validateBulkDraft
                      }
                    >
                      {mode === 'single' || pendingBulkCurrent ? 'Save draft' : 'Preview'}
                    </Button>
                    {mode === 'single' && (
                      <>
                        <Button
                          aria-haspopup="menu"
                          size="small"
                          disabled={Boolean(busy)}
                          onClick={(event) => setRecordAnchor(event.currentTarget)}
                        >
                          Record actions
                        </Button>
                        <Menu
                          anchorEl={recordAnchor}
                          open={Boolean(recordAnchor)}
                          onClose={() => setRecordAnchor(null)}
                        >
                          <MenuItem
                            onClick={() => {
                              setRecordAnchor(null);
                              loadNew('subject');
                            }}
                          >
                            New subject
                          </MenuItem>
                          <MenuItem
                            disabled={!selectedSubject}
                            onClick={() => {
                              setRecordAnchor(null);
                              loadNew('quiz');
                            }}
                          >
                            New quiz
                          </MenuItem>
                          <MenuItem
                            disabled={!selectedQuiz}
                            onClick={() => {
                              setRecordAnchor(null);
                              loadNew('question');
                            }}
                          >
                            New item
                          </MenuItem>
                          {selection.id && (
                            <MenuItem
                              onClick={() => {
                                setRecordAnchor(null);
                                requestDelete(selection, selection.id!);
                              }}
                            >
                              Delete…
                            </MenuItem>
                          )}
                        </Menu>
                      </>
                    )}
                  </Stack>
                  {pendingBulkCurrent && pendingBulk && (
                    <Alert
                      severity={
                        issues.some((issue) => issue.level === 'error')
                          ? 'error'
                          : issues.some((issue) => issue.level === 'warning')
                            ? 'warning'
                            : 'success'
                      }
                    >
                      <Typography variant="body2">
                        {pendingBulk.generatedIds.length} generated IDs. First IDs:{' '}
                        {pendingBulk.generatedIds.slice(0, 12).join(', ')}
                      </Typography>
                      {pendingBulk.generatedIds.length > 12 && (
                        <details>
                          <summary>Review all generated IDs</summary>
                          <Typography
                            variant="caption"
                            component="pre"
                            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflow: 'auto' }}
                          >
                            {pendingBulk.generatedIds.join('\n')}
                          </Typography>
                        </details>
                      )}
                    </Alert>
                  )}
                </Stack>
              </Paper>
              <AdminStatusPanel
                bank={snapshot.bank}
                issues={issues}
                questionPaths={pendingBulkCurrent ? pendingBulk?.questionPaths : undefined}
                summary={summary}
                editorDirty={editorDirty}
                busy={busy}
              />
            </Stack>
          )}
          <AdminDeleteDialog
            currentReviewKey={deletionKey}
            busy={Boolean(busy)}
            request={deleteRequest}
            bank={snapshot.bank}
            flashcardBank={snapshot.flashcards ?? gateway.getFlashcardBank()}
            error={deleteError}
            onClose={() => {
              setDeleteRequest(undefined);
              setDeleteError('');
            }}
            onConfirm={() => {
              void confirmDelete();
            }}
          />
        </Container>
      )}
    </AppShell>
  );
}
