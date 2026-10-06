import { useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Container, Divider, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { AppShell } from '../app/components/AppShell';
import { ScreenLoading } from '../app/components/ScreenLoading';
import { storedQuestionBank } from '../content/questionBank';
import { AdminNavigatorPanel } from './components/AdminNavigatorPanel';
import { AdminStatusPanel } from './components/AdminStatusPanel';
import { InMemoryQuestionBankGateway } from './data/InMemoryQuestionBankGateway';
import { useAdminEditor } from './useAdminEditor';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';

const gateway = new InMemoryQuestionBankGateway(storedQuestionBank);
const localAdminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_ADMIN === 'true';

export function AdminApp() {
  const [section, setSection] = useState<'quizzes' | 'flashcards'>('quizzes');
  const {
    snapshot, originalRevision, selection, mode, editor, reason, issues, summary, dirty, exported,
    filter, setFilter, pendingBulk, importedChangeSet, bulkTarget, busy, loadError,
    selectedQuiz, selectedSubject, hasAppliedChanges, loadEntity, loadNew,
    chooseBulkTarget, chooseBulkSubject, chooseBulkQuiz, showSingle, editRecord, editReason,
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

  const header = <Box component="header" sx={{ py: 1.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}>
    <Container maxWidth={false}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={.75} sx={{ color: 'text.primary', fontSize: 20, letterSpacing: '-.04em', fontWeight: 700 }}><MenuBookRoundedIcon sx={{ color: 'primary.main' }} /><Box component="span"><Box component="span" sx={{ color: 'primary.main' }}>Med</Box>ucation</Box></Stack>
        <Typography variant="body2" color="text.secondary">Admin</Typography>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Changes stay local until export.</Typography>
        <Button size="small" disabled={!snapshot || Boolean(busy)} onClick={() => importFileRef.current?.click()}>Import</Button>
        <Button size="small" color="success" variant="contained" disabled={!snapshot || Boolean(busy) || !hasAppliedChanges} onClick={exportFiles}>Export</Button>
        <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={event => { void importChangeSetFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      </Stack>
    </Stack></Container>
  </Box>;

  return <AppShell header={header} busy={Boolean(localAdminEnabled && !snapshot && !loadError)}>
    {!localAdminEnabled ? <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="warning">The JSON content admin is disabled in production builds. It is not an authentication mechanism.</Alert></Container>
      : !snapshot ? loadError ? <Container sx={{ py: 8 }}><Alert severity="error">{loadError}</Alert></Container> : <ScreenLoading label="Loading question bank…" />
        : <Container maxWidth={false} sx={{ py: 2 }}>
    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
      <Button variant={section === 'quizzes' ? 'contained' : 'outlined'} onClick={() => setSection('quizzes')}>Quizzes</Button>
      <Button variant={section === 'flashcards' ? 'contained' : 'outlined'} onClick={() => setSection('flashcards')}>Flashcards</Button>
    </Stack>
    <Box sx={{ display: section === 'flashcards' ? 'block' : 'none' }}><FlashcardAdminPanel subjects={snapshot.bank.subjects} onBankChange={bank => gateway.setFlashcardBank(bank)} quizRevision={snapshot.revision} originalQuizRevision={originalRevision} quizChangesStaged={hasAppliedChanges}
      quizBank={snapshot.bank} quizChangeSet={hasAppliedChanges ? { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: originalRevision }, reason, operations: gateway.appliedOperations() } : undefined}
      onStagePairedImport={stageCoordinatedImport} onResetPaired={resetCoordinatedWorkspace} onPairedExport={markCoordinatedExport} externalBusy={Boolean(busy)} /></Box>
    {section === 'quizzes' &&
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <AdminNavigatorPanel bank={snapshot.bank} selection={selection} selectedSubjectId={selectedSubject?.id} selectedQuizId={selectedQuiz?.id} filter={filter} setFilter={setFilter} loadEntity={loadEntity} loadNew={loadNew} />
      <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}>
        <Tabs value={mode} onChange={(_, value) => {
          if (value === 'bulk') chooseBulkTarget(selection.kind === 'question' || selection.kind === 'quiz'
            ? 'quiz' : selection.kind === 'subject' && selection.id ? 'subject' : 'newSubject');
          else showSingle();
        }}><Tab value="single" label="Record" /><Tab value="bulk" label="Bulk add" /></Tabs>
        {mode === 'bulk' && <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Button size="small" onClick={() => chooseBulkTarget('newSubject')}>New subject</Button>
          <Button size="small" onClick={() => chooseBulkTarget('subject')}>Add quizzes</Button>
          <Button size="small" onClick={() => chooseBulkTarget('quiz')}>Add items</Button>
        </Stack>}
        <Stack spacing={2} sx={{ mt: 2 }}><TextField label="Reason" value={reason} onChange={event => editReason(event.target.value)} required fullWidth />
          {mode === 'bulk' && bulkTarget.kind !== 'newSubject' && <TextField select label="Subject" value={bulkTarget.subjectId ?? ''} onChange={event => chooseBulkSubject(event.target.value)} fullWidth>
            <MenuItem value="" disabled>Choose a subject</MenuItem>
            {snapshot.bank.subjects.map(subject => <MenuItem key={subject.id} value={subject.id}>{subject.name}</MenuItem>)}
          </TextField>}
          {mode === 'bulk' && bulkTarget.kind === 'quiz' && <TextField select label="Quiz" value={bulkTarget.quizId ?? ''} disabled={!bulkTarget.subjectId} onChange={event => chooseBulkQuiz(event.target.value)} fullWidth>
            <MenuItem value="" disabled>Choose a quiz</MenuItem>
            {bulkQuizzes.map(quiz => <MenuItem key={quiz.id} value={quiz.id}>{quiz.name}</MenuItem>)}
          </TextField>}
          {mode === 'bulk' && <Alert severity="info">{bulkTargetLabel}</Alert>}
          <TextField label="JSON" value={editor} onChange={event => editRecord(event.target.value)} multiline minRows={16} maxRows={24} fullWidth InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} placeholder={mode === 'single' ? 'Select an entity or create a template.' : 'Edit subject, quiz, and item content.'} />
          {mode === 'bulk' && <Typography variant="caption" color="text.secondary">Items need stem, 2–26 choice strings, answer label, and rationale. Optional content fields: verifiedAnswer, answerNote, rationaleMeta, choiceExplanations, pearls, metadata.</Typography>}
          <Stack direction="row" spacing={1} flexWrap="wrap"><Button variant="contained" disabled={Boolean(busy)} onClick={mode === 'single' ? stageSingle : validateBulkDraft}>{mode === 'single' ? 'Stage' : 'Validate'}</Button>{mode === 'bulk' && pendingBulk && <Button color="success" variant="contained" disabled={Boolean(busy)} onClick={stageValidatedBulk}>Stage</Button>}{mode === 'single' && selection.id && <Button color="error" disabled={Boolean(busy)} onClick={stageDelete}>Delete</Button>}<Divider flexItem orientation="vertical" sx={{ mx: .5 }} /><Button disabled={Boolean(busy) || !hasAppliedChanges} onClick={undo}>Undo</Button><Button disabled={Boolean(busy) || !hasAppliedChanges} onClick={reset}>Reset</Button></Stack>
          {pendingBulk && <Alert severity={issues.some(issue => issue.level === 'error') ? 'error' : issues.some(issue => issue.level === 'warning') ? 'warning' : 'success'}>
            <Typography variant="body2">{pendingBulk.generatedIds.length} generated IDs: {pendingBulk.generatedIds.join(', ')}</Typography>
          </Alert>}
          {importedChangeSet && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}><Typography variant="subtitle1">Import preview</Typography><TextField value={importedChangeSet.text} multiline minRows={8} fullWidth InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} /><Button variant="contained" disabled={Boolean(busy) || importedChangeSet.issues.some(issue => issue.level === 'error')} onClick={stageImportedChangeSet}>Stage import</Button></Stack></Paper>}
        </Stack>
      </Paper>
      <AdminStatusPanel bank={snapshot.bank} issues={issues} questionPaths={pendingBulk?.questionPaths} summary={summary} dirty={dirty} exported={exported} busy={busy} />
    </Stack>}
        </Container>}
  </AppShell>;
}
