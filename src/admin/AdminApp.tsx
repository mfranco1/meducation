import { useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Container, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { AppBrand } from '../shared/ui/brand/AppBrand';
import { AppShell } from '../shared/ui/shell/AppShell';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
import { storedQuestionBank } from '../content/local/questionBank';
import { AdminNavigatorPanel } from './components/AdminNavigatorPanel';
import { AdminStatusPanel } from './components/AdminStatusPanel';
import { AdminDeleteDialog, type DeleteRequest } from './components/AdminDeleteDialog';
import { InMemoryQuestionBankGateway } from './data/InMemoryQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { applyFlashcardOperations, type FlashcardAdminOperation } from './core/flashcardChangeSet';
import type { StoredFlashcardBank } from '../content/schema/schema';
import { parseChangeSet } from './core/changeSetSchema';

const gateway = new InMemoryQuestionBankGateway(storedQuestionBank);
const localAdminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_ADMIN === 'true';

export function AdminApp() {
  const [section, setSection] = useState<'quizzes' | 'flashcards'>('quizzes');
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>();
  const [deleteReason, setDeleteReason] = useState('Remove obsolete content');
  const [deleteError, setDeleteError] = useState('');
  const [undoPulse, setUndoPulse] = useState(0);
  const [coordinatedTransaction, setCoordinatedTransaction] = useState<{ id: number; bank: StoredFlashcardBank; operations: FlashcardAdminOperation[]; reason: string; quizOperationCount: number }>({ id: 0, bank: gateway.getFlashcardBank(), operations: [], reason: 'Local flashcard content edit', quizOperationCount: 0 });
  const flashcardWorkspace = useRef({ bank: gateway.getFlashcardBank(), operations: [] as FlashcardAdminOperation[], reason: 'Local flashcard content edit' });
  const [workspaceAnchor, setWorkspaceAnchor] = useState<HTMLElement | null>(null);
  const flashcardExport = useRef<() => void>(() => undefined);
  const [flashcardExportEnabled, setFlashcardExportEnabled] = useState(false);
  const {
    snapshot, originalRevision, selection, mode, editor, reason, issues, summary, dirty, exported,
    filter, setFilter, pendingBulk, importedChangeSet, bulkTarget, busy, loadError,
    selectedQuiz, selectedSubject, hasAppliedChanges, loadEntity, loadNew,
    chooseBulkTarget, chooseBulkSubject, chooseBulkQuiz, showSingle, editRecord,
    stageSingle, validateBulkDraft, stageValidatedBulk, importChangeSetFile,
    stageImportedChangeSet, stageDelete, undo, reset, exportFiles,
    stageCoordinatedImport,
    resetCoordinatedWorkspace,
    markCoordinatedExport,
  } = useAdminEditor(gateway);
  const importFileRef = useRef<HTMLInputElement>(null);
  const bulkSubjectId = bulkTarget.kind === 'newSubject' ? undefined : bulkTarget.subjectId;
  const bulkSubject = snapshot?.bank.subjects.find(subject => subject.id === bulkSubjectId);
  const bulkQuizzes = useMemo(() => !snapshot || !bulkSubjectId ? [] : snapshot.bank.quizzes.filter(quiz => quiz.subjectId === bulkSubjectId), [snapshot, bulkSubjectId]);
  const bulkQuizId = bulkTarget.kind === 'quiz' ? bulkTarget.quizId : undefined;
  const bulkQuiz = snapshot?.bank.quizzes.find(quiz => quiz.id === bulkQuizId);

  const bulkTargetLabel = bulkTarget.kind === 'newSubject'
    ? 'New subject'
    : bulkTarget.kind === 'subject'
      ? bulkSubject?.name ?? 'Choose a subject'
      : bulkSubject && bulkQuiz
        ? `${bulkSubject.name} / ${bulkQuiz.name}`
        : bulkSubject?.name ?? 'Choose a subject and quiz';

  const confirmDelete = async () => {
    const request = deleteRequest;
    if (!request || !snapshot) return;
    if (request.selection.kind !== 'subject') {
      setDeleteRequest(undefined);
      stageDelete(request.selection, deleteReason);
      return;
    }
    const parentId = request.selection.id;
    if (!parentId) return;
    try {
      const workspace = flashcardWorkspace.current;
      const childDecks = workspace.bank.decks.filter((deck) => deck.subjectId === parentId);
      const cascades: FlashcardAdminOperation[] = childDecks.map((deck) => ({ op: 'deck.delete', id: deck.id, cascade: true }));
      const operations = [...workspace.operations, ...cascades];
      const flashcards = applyFlashcardOperations(workspace.bank, snapshot.bank.subjects, cascades);
      const parsed = parseChangeSet({ changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: snapshot.revision }, reason: deleteReason, operations: [{ op: 'subject.delete', id: parentId, cascade: true }] });
      if (!parsed.changeSet) throw new Error('The subject deletion could not be prepared.');
      await stageCoordinatedImport(parsed.changeSet, flashcards);
      const pairedReason = `${workspace.reason}; ${deleteReason}`;
      setCoordinatedTransaction((previous) => ({ id: previous.id + 1, bank: flashcards, operations, reason: pairedReason, quizOperationCount: gateway.appliedOperations().length }));
      setDeleteError('');
      setDeleteRequest(undefined);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The paired subject deletion could not be staged.');
    }
  };

  const header = <Box component="header" sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
    <Container maxWidth={false}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <AppBrand />
        <Typography variant="body2" color="text.secondary">Admin</Typography>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        {section === 'quizzes' ? <Button size="small" variant="contained" disabled={!snapshot || Boolean(busy) || !hasAppliedChanges || coordinatedTransaction.id > 0} onClick={exportFiles}>Export quizzes</Button>
          : <Button size="small" variant="contained" disabled={Boolean(busy) || !flashcardExportEnabled} onClick={() => flashcardExport.current()}>Export flashcards</Button>}
        <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={event => { void importChangeSetFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      </Stack>
    </Stack></Container>
  </Box>;

  return <AppShell header={header} busy={Boolean(localAdminEnabled && !snapshot && !loadError)}>
    {!localAdminEnabled ? <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="warning">The JSON content admin is disabled in production builds. It is not an authentication mechanism.</Alert></Container>
      : !snapshot ? loadError ? <Container sx={{ py: 8 }}><Alert severity="error">{loadError}</Alert></Container> : <ScreenLoading label="Loading question bank…" />
        : <Container maxWidth={false} sx={{ py: 2 }}>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
      <Button variant={section === 'quizzes' ? 'contained' : 'outlined'} onClick={() => setSection('quizzes')}>Quizzes</Button>
      <Button variant={section === 'flashcards' ? 'contained' : 'outlined'} onClick={() => setSection('flashcards')}>Flashcards</Button>
    </Stack>
    <Box sx={{ display: section === 'flashcards' ? 'block' : 'none' }}><FlashcardAdminPanel subjects={snapshot.bank.subjects} onAddSubject={() => { setSection('quizzes'); loadNew('subject'); }} onEditSubject={(id) => { const subject = snapshot.bank.subjects.find((item) => item.id === id); if (subject) { setSection('quizzes'); loadEntity({ kind: 'subject', id }, subject); } }} onBankChange={bank => gateway.setFlashcardBank(bank)} onExportReady={(action, enabled) => { flashcardExport.current = action; setFlashcardExportEnabled(enabled); }} onWorkspaceChange={(bank, operations, changeReason) => { flashcardWorkspace.current = { bank, operations, reason: changeReason }; }} externalTransaction={coordinatedTransaction} undoRequest={undoPulse} onUndoCoordinated={async () => { await undo(); setCoordinatedTransaction((previous) => ({ ...previous, id: 0 })); }} onDeleteSubject={(id, name) => { setDeleteReason(reason); setDeleteError(''); setDeleteRequest({ selection: { kind: 'subject', id }, label: name }); }} quizRevision={snapshot.revision} originalQuizRevision={originalRevision} quizChangesStaged={hasAppliedChanges}
      quizBank={snapshot.bank} quizChangeSet={hasAppliedChanges ? { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: originalRevision }, reason, operations: gateway.appliedOperations() } : undefined}
      onStagePairedImport={stageCoordinatedImport} onResetPaired={async (flashcards) => { await resetCoordinatedWorkspace(flashcards); setCoordinatedTransaction((previous) => ({ ...previous, id: 0 })); }} onPairedExport={markCoordinatedExport} externalBusy={Boolean(busy)} /></Box>
    {section === 'quizzes' &&
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <AdminNavigatorPanel bank={snapshot.bank} selection={selection} selectedSubjectId={selectedSubject?.id} selectedQuizId={selectedQuiz?.id} filter={filter} setFilter={setFilter} loadEntity={loadEntity} loadNew={loadNew} chooseBulkTarget={chooseBulkTarget} onDelete={(next, label) => { setDeleteReason(reason); setDeleteRequest({ selection: next, label }); }} />
      <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}>
        <Tabs value={mode} onChange={(_, value) => {
          if (value === 'bulk') chooseBulkTarget(selection.kind === 'question' || selection.kind === 'quiz'
            ? 'quiz' : selection.kind === 'subject' && selection.id ? 'subject' : 'newSubject');
          else showSingle();
        }}><Tab value="single" label="Record" /><Tab value="bulk" label="Bulk add" /></Tabs>
        {mode === 'bulk' && <TextField select label="Bulk destination" value={bulkTarget.kind} onChange={event => chooseBulkTarget(event.target.value as 'newSubject' | 'subject' | 'quiz')} fullWidth sx={{ mt: 2 }}>
          <MenuItem value="newSubject">Create a subject and quizzes</MenuItem><MenuItem value="subject">Add quizzes to a subject</MenuItem><MenuItem value="quiz">Add items to a quiz</MenuItem>
        </TextField>}
        <Stack spacing={2} sx={{ mt: 2 }}>
          {mode === 'bulk' && bulkTarget.kind !== 'newSubject' && <TextField select label="Subject" value={bulkTarget.subjectId ?? ''} onChange={event => chooseBulkSubject(event.target.value)} fullWidth>
            <MenuItem value="" disabled>Choose a subject</MenuItem>
            {snapshot.bank.subjects.map(subject => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
          </TextField>}
          {mode === 'bulk' && bulkTarget.kind === 'quiz' && <TextField select label="Quiz" value={bulkTarget.quizId ?? ''} disabled={!bulkTarget.subjectId} onChange={event => chooseBulkQuiz(event.target.value)} fullWidth>
            <MenuItem value="" disabled>Choose a quiz</MenuItem>
            {bulkQuizzes.map(quiz => <MenuItem key={quiz.id} value={quiz.id}>{quiz.name}</MenuItem>)}
          </TextField>}
          {mode === 'bulk' && <Typography variant="body2" color="text.secondary">Destination · {bulkTargetLabel}</Typography>}
          <TextField label="JSON" slotProps={{ inputLabel: { shrink: true } }} value={editor} onChange={event => editRecord(event.target.value)} multiline minRows={16} maxRows={24} fullWidth InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} placeholder={mode === 'single' ? 'Select an entity or create a template.' : 'Edit subject, quiz, and item content.'} />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="contained" disabled={Boolean(busy)} onClick={mode === 'single' ? stageSingle : validateBulkDraft}>{mode === 'single' ? 'Stage' : 'Validate'}</Button>
            {mode === 'bulk' && pendingBulk && <Button variant="contained" disabled={Boolean(busy)} onClick={stageValidatedBulk}>Stage</Button>}
            {mode === 'single' && selection.id && <Button color="error" disabled={Boolean(busy)} onClick={() => { setDeleteReason(reason); setDeleteRequest({ selection, label: selection.id! }); }}>Delete…</Button>}
            <Button disabled={Boolean(busy) || !hasAppliedChanges} onClick={() => { if (coordinatedTransaction.id && gateway.appliedOperations().length === coordinatedTransaction.quizOperationCount) { setSection('flashcards'); setUndoPulse((value) => value + 1); } else void undo(); }}>Undo</Button>
            <Button size="small" aria-haspopup="menu" onClick={(event) => setWorkspaceAnchor(event.currentTarget)}>Workspace</Button>
            <Menu anchorEl={workspaceAnchor} open={Boolean(workspaceAnchor)} onClose={() => setWorkspaceAnchor(null)}>
              <MenuItem disabled={!hasAppliedChanges || Boolean(busy) || coordinatedTransaction.id > 0} onClick={() => { setWorkspaceAnchor(null); reset(); }}>Reset quizzes</MenuItem>
            <MenuItem disabled={!snapshot || Boolean(busy)} onClick={() => { setWorkspaceAnchor(null); importFileRef.current?.click(); }}>Import quiz change set</MenuItem>
            </Menu>
          </Stack>
          {pendingBulk && <Alert severity={issues.some(issue => issue.level === 'error') ? 'error' : issues.some(issue => issue.level === 'warning') ? 'warning' : 'success'}>
            <Typography variant="body2">{pendingBulk.generatedIds.length} generated IDs. First IDs: {pendingBulk.generatedIds.slice(0, 12).join(', ')}</Typography>
            {pendingBulk.generatedIds.length > 12 && <details><summary>Review all generated IDs</summary><Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflow: 'auto' }}>{pendingBulk.generatedIds.join('\n')}</Typography></details>}
          </Alert>}
          {importedChangeSet && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}><Typography variant="subtitle1">Import preview · {importedChangeSet.changeSet.operations.length} operations</Typography><TextField value={importedChangeSet.text} multiline minRows={8} maxRows={14} fullWidth InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} /><Button variant="contained" disabled={Boolean(busy) || importedChangeSet.issues.some(issue => issue.level === 'error')} onClick={stageImportedChangeSet}>Stage import</Button></Stack></Paper>}
        </Stack>
      </Paper>
      <AdminStatusPanel bank={snapshot.bank} issues={issues} questionPaths={pendingBulk?.questionPaths} summary={summary} dirty={dirty} exported={exported} busy={busy} />
    </Stack>}
        <AdminDeleteDialog request={deleteRequest} bank={snapshot.bank} flashcardBank={gateway.getFlashcardBank()} reason={deleteReason} error={deleteError} onClose={() => { setDeleteRequest(undefined); setDeleteError(''); }} onReasonChange={setDeleteReason} onConfirm={() => { void confirmDelete(); }} />
        </Container>}
  </AppShell>;
}
