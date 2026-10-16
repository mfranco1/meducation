import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Container,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { AppShell } from '../shared/ui/shell/AppShell';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
import { AdminEditorFrame, AdminEditorEmpty, AdminEditorActions } from './components/AdminEditorFrame';
import { AdminBatchHeader } from './components/AdminBatchHeader';
import { SubjectEditorDialog } from './SubjectEditorDialog';
import { AdminNavigatorPanel } from './components/AdminNavigatorPanel';
import { AdminStatusPanel } from './components/AdminStatusPanel';
import { AdminDeleteDialog, type DeleteRequest } from './components/AdminDeleteDialog';
import { HttpQuestionBankGateway } from './data/HttpQuestionBankGateway';
import { AdminActionCanceled } from './core/AdminActionCanceled';
import { useAdminConfirmation } from './useAdminConfirmation';
import { useAdminEditor } from './useAdminEditor';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { applyFlashcardOperations, type FlashcardAdminOperation } from './core/flashcardChangeSet';
import { parseChangeSet } from './core/changeSetSchema';
import type { AdminDraftState } from './core/workspaceStatus';

export function AdminWorkspace({
  gateway,
  header,
  feedback,
  recovery,
  externalBusy = false,
  onDirtyChange,
}: {
  gateway: HttpQuestionBankGateway;
  header?: ReactNode;
  feedback?: ReactNode;
  recovery?: ReactNode;
  externalBusy?: boolean;
  onDirtyChange?: (dirty: AdminDraftState) => void;
}) {
  const [subjectTarget, setSubjectTarget] = useState<{ id?: string }>();
  const [subjectDirty, setSubjectDirty] = useState(false);
  const reportSubjectDirty = useCallback((dirty: boolean) => setSubjectDirty(dirty), []);
  const [section, setSection] = useState<'quizzes' | 'flashcards'>('quizzes');
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>();
  const [flashcardDiscardRequest, setFlashcardDiscardRequest] = useState(0);
  const [deleteReason, setDeleteReason] = useState('Remove obsolete content');
  const [deleteError, setDeleteError] = useState('');
  const [flashcardEditVersion, setFlashcardEditVersion] = useState(0);
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
    discardDialog,
    snapshot,
    selection,
    mode,
    editor,
    recordLoaded,
    reason,
    issues,
    summary,
    editorDirty,
    filter,
    setFilter,
    pendingBulk,
    bulkTarget,
    busy: editorBusy,
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
  } = useAdminEditor(gateway, { blocked: externalBusy });
  const confirmation = useAdminConfirmation([editor, flashcardEditVersion, gateway.current, externalBusy]);
  const busy = editorBusy || (externalBusy ? 'Another authoring command is in progress' : undefined);
  const openSubject = (id?: string) => {
    if (!busy) setSubjectTarget({ id });
  };
  useEffect(() => {
    onDirtyChange?.({ quizzes: editorDirty || subjectDirty, flashcards: flashcardDirty || subjectDirty });
  }, [editorDirty, flashcardDirty, subjectDirty, onDirtyChange]);
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
      if (staged === true) setDeleteRequest(undefined);
      else if (staged === 'canceled') setDeleteError('');
      else setDeleteError('The deletion was not saved. Your edits are kept.');
      return;
    }
    const parentId = request.selection.id;
    if (!parentId) return;
    try {
      if (
        flashcardDraft.current &&
        !(await confirmation.request('Discard unsaved flashcard drafts after saving this paired subject deletion?'))
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
      if (error instanceof AdminActionCanceled) {
        setDeleteError('');
        return;
      }
      setDeleteError(error instanceof Error ? error.message : 'The paired subject deletion could not be saved.');
    }
  };

  return (
    <AppShell header={header} busy={Boolean(!snapshot && !loadError)}>
      {feedback}
      {discardDialog}
      {confirmation.dialog}
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
          <Tabs
            value={section}
            onChange={(_, value) => setSection(value)}
            aria-label="Content workspace"
            sx={{ mb: 2 }}
          >
            <Tab
              value="quizzes"
              id="quizzes-tab"
              aria-controls="quizzes-panel"
              aria-label="Quizzes"
              aria-describedby={editorDirty || subjectDirty ? 'quizzes-unsaved' : undefined}
              label={<>Quizzes{(editorDirty || subjectDirty) && <span id="quizzes-unsaved"> • Unsaved</span>}</>}
            />
            <Tab
              value="flashcards"
              id="flashcards-tab"
              aria-controls="flashcards-panel"
              aria-label="Flashcards"
              aria-describedby={flashcardDirty || subjectDirty ? 'flashcards-unsaved' : undefined}
              label={
                <>Flashcards{(flashcardDirty || subjectDirty) && <span id="flashcards-unsaved"> • Unsaved</span>}</>
              }
            />
          </Tabs>
          <Box role="tabpanel" id="flashcards-panel" aria-labelledby="flashcards-tab" hidden={section !== 'flashcards'}>
            <FlashcardAdminPanel
              recovery={recovery}
              reviewBeforeSave
              discardRequest={flashcardDiscardRequest}
              serverBank={snapshot.flashcards!}
              onSaveBank={(bank, reason) => gateway.saveFlashcards(bank, reason)}
              onDraftChange={reportFlashcardDirty}
              onEdit={() => {
                setFlashcardEditVersion((value) => value + 1);
                gateway.invalidate();
              }}
              subjects={snapshot.bank.subjects}
              onAddSubject={() => openSubject()}
              onManageSubjects={(id) => openSubject(id)}
              onEditSubject={(id) => openSubject(id)}
              onDeleteSubject={(id, name) => requestDelete({ kind: 'subject', id }, name)}
              quizRevision={snapshot.revision}
              externalBusy={Boolean(busy)}
            />
          </Box>
          <Stack
            hidden={section !== 'quizzes'}
            sx={{ display: section === 'quizzes' ? 'flex' : 'none' }}
            role="tabpanel"
            id="quizzes-panel"
            aria-labelledby="quizzes-tab"
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2}
            alignItems="flex-start"
          >
            <AdminNavigatorPanel
              disabled={Boolean(busy)}
              onManageSubjects={(id) => openSubject(id)}
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
            <AdminEditorFrame label="Quiz editor">
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
              {mode === 'single' && !recordLoaded ? (
                <AdminEditorEmpty
                  title={!selectedSubject ? 'Choose a subject' : !selectedQuiz ? 'Choose a quiz' : 'Choose a question'}
                >
                  <Button
                    onClick={() =>
                      selectedSubject ? chooseBulkTarget(selectedQuiz ? 'quiz' : 'subject') : setSubjectTarget({})
                    }
                  >
                    {selectedQuiz ? 'Add questions' : selectedSubject ? 'Add quizzes' : 'Add subject'}
                  </Button>
                </AdminEditorEmpty>
              ) : (
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
                    <AdminBatchHeader destination={bulkTargetLabel} reviewReady={pendingBulkCurrent} reserved />
                  )}
                  {mode === 'single' && (
                    <Typography variant="h6">
                      {selection.id ? 'Edit' : 'New'} {selection.kind === 'question' ? 'question' : selection.kind}
                    </Typography>
                  )}
                  {mode === 'single' && (
                    <Typography variant="body2" color="text.secondary">
                      {[selectedSubject?.name, selectedQuiz?.name, selection.id].filter(Boolean).join(' / ')}
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
                  <AdminEditorActions dirty={editorDirty} busy={Boolean(busy)}>
                    <Button
                      variant="contained"
                      disabled={Boolean(busy) || (mode === 'single' && !editor.trim())}
                      onClick={
                        mode === 'single' ? stageSingle : pendingBulkCurrent ? stageValidatedBulk : validateBulkDraft
                      }
                    >
                      {mode === 'single' || pendingBulkCurrent ? 'Review save' : 'Preview'}
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
                              openSubject();
                            }}
                          >
                            New subject
                          </MenuItem>
                          <MenuItem
                            disabled={!selectedSubject}
                            onClick={() => {
                              setRecordAnchor(null);
                              chooseBulkTarget('subject');
                            }}
                          >
                            Add quizzes
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
                  </AdminEditorActions>
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
                        {pendingBulk.generatedIds.length} server-reserved IDs. First IDs:{' '}
                        {pendingBulk.generatedIds.slice(0, 12).join(', ')}
                      </Typography>
                      {pendingBulk.generatedIds.length > 12 && (
                        <details>
                          <summary>Review all server-reserved IDs</summary>
                          <Typography
                            variant="caption"
                            component="pre"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                              maxHeight: 180,
                              overflow: 'auto',
                            }}
                          >
                            {pendingBulk.generatedIds.join('\n')}
                          </Typography>
                        </details>
                      )}
                    </Alert>
                  )}
                </Stack>
              )}
              <AdminStatusPanel
                embedded
                bank={snapshot.bank}
                issues={issues}
                questionPaths={pendingBulkCurrent ? pendingBulk?.questionPaths : undefined}
                summary={summary}
                editorDirty={editorDirty}
                busy={busy}
              />
            </AdminEditorFrame>
          </Stack>
          {subjectTarget && (
            <SubjectEditorDialog
              key={subjectTarget.id ?? 'new'}
              gateway={gateway}
              initialId={subjectTarget.id}
              blocked={Boolean(busy)}
              recovery={recovery}
              onDirtyChange={reportSubjectDirty}
              onClose={() => setSubjectTarget(undefined)}
            />
          )}
          <AdminDeleteDialog
            recovery={recovery}
            commitLabel="Review"
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
