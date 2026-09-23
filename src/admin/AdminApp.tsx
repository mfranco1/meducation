import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonGroup, Chip, Container, Divider, FormControl, InputLabel, List, ListItemButton,
  ListItemText, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { storedQuestionBank } from '../content/questionBank';
import type { StoredQuestionBank } from '../content/schema';
import type { ValidationIssue } from '../content/validate';
import { parseChangeSet } from './core/changeSetSchema';
import { serializeBank } from './core/serializeBank';
import { newQuestion, newQuiz, newSubject } from './core/templates';
import type { AdminChangeSet, AdminOperation } from './core/types';
import { InMemoryQuestionBankGateway } from './data/InMemoryQuestionBankGateway';

type EntityKind = 'subject' | 'quiz' | 'question';
type Selection = { kind: EntityKind; id?: string; parentId?: string };
const gateway = new InMemoryQuestionBankGateway(storedQuestionBank);
const localAdminEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_ADMIN === 'true';

function download(filename: string, content: string) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function issueText(issues: ValidationIssue[]) {
  return issues.length ? issues.map(issue => `${issue.level.toUpperCase()}${issue.questionId ? ` [${issue.questionId}]` : ''}: ${issue.message}`).join('\n') : 'No validation issues.';
}

export function AdminApp() {
  const [snapshot, setSnapshot] = useState<{ bank: StoredQuestionBank; revision: string }>();
  const [originalRevision, setOriginalRevision] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'subject' });
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local question-bank edit');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [summary, setSummary] = useState('Load a record or paste a change set.');
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { gateway.load().then(loaded => { setSnapshot(loaded); setOriginalRevision(loaded.revision); }); }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const selectedSubject = snapshot?.bank.subjects.find(subject => subject.id === selection.id);
  const selectedQuiz = snapshot?.bank.quizzes.find(quiz => quiz.id === selection.id);
  const selectedQuestion = snapshot?.bank.questions.find(question => question.id === selection.id);
  const entity = selection.kind === 'subject' ? selectedSubject : selection.kind === 'quiz' ? selectedQuiz : selectedQuestion;
  const filteredSubjects = useMemo(() => snapshot?.bank.subjects.filter(subject => `${subject.id} ${subject.name}`.toLowerCase().includes(filter.toLowerCase())) ?? [], [snapshot, filter]);
  const visibleQuizzes = useMemo(() => !snapshot ? [] : snapshot.bank.quizzes.filter(quiz => quiz.subjectId === selection.parentId || quiz.subjectId === selectedSubject?.id), [snapshot, selection.parentId, selectedSubject?.id]);
  const visibleQuestions = useMemo(() => !snapshot ? [] : snapshot.bank.questions.filter(question => question.quizId === selection.parentId || question.quizId === selectedQuiz?.id), [snapshot, selection.parentId, selectedQuiz?.id]);

  const loadEntity = (next: Selection, value: unknown) => {
    setSelection(next); setMode('single'); setEditor(JSON.stringify(value, null, 2)); setIssues([]); setSummary('Edit the complete JSON record, then stage it.');
  };
  const loadNew = (kind: EntityKind) => {
    if (!snapshot) return;
    const value = kind === 'subject' ? newSubject(snapshot.bank) : kind === 'quiz'
      ? newQuiz(snapshot.bank, selectedSubject?.id ?? selection.parentId ?? '')
      : newQuestion(snapshot.bank, selectedQuiz?.id ?? selection.parentId ?? '');
    loadEntity({ kind, parentId: kind === 'quiz' ? (value as { subjectId: string }).subjectId : kind === 'question' ? (value as { quizId: string }).quizId : undefined }, value);
    setSelection(previous => ({ ...previous, id: undefined }));
  };

  const buildSingleChangeSet = (): AdminChangeSet | undefined => {
    if (!snapshot) return undefined;
    try {
      const value = JSON.parse(editor) as Record<string, unknown>;
      const creating = !selection.id;
      const operation: unknown = creating
        ? { op: `${selection.kind}.create`, value }
        : { op: `${selection.kind}.update`, id: selection.id, value };
      const parsed = parseChangeSet({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: snapshot.revision }, reason, operations: [operation] });
      if (!parsed.changeSet) { setIssues(parsed.errors.map(message => ({ level: 'error', message }))); return undefined; }
      return parsed.changeSet;
    } catch { setIssues([{ level: 'error', message: 'Record JSON is invalid.' }]); return undefined; }
  };
  const buildBulkChangeSet = (): AdminChangeSet | undefined => {
    try {
      const parsed = parseChangeSet(JSON.parse(editor));
      if (!parsed.changeSet) { setIssues(parsed.errors.map(message => ({ level: 'error', message }))); return undefined; }
      return parsed.changeSet;
    } catch { setIssues([{ level: 'error', message: 'Change-set JSON is invalid.' }]); return undefined; }
  };
  const stage = async () => {
    const changeSet = mode === 'single' ? buildSingleChangeSet() : buildBulkChangeSet();
    if (!changeSet) return;
    const preview = await gateway.preview(changeSet);
    setIssues(preview.issues);
    setSummary(`${preview.summary.creates} create, ${preview.summary.updates} update, ${preview.summary.deletes} delete, ${preview.summary.moves} move; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`);
    if (preview.issues.some(issue => issue.level === 'error')) return;
    if ((preview.summary.cascadedQuizzes || preview.summary.cascadedQuestions) && !window.confirm('This change cascades to child records. Stage it?')) return;
    const next = await gateway.apply(changeSet);
    setSnapshot(next);
    if (mode === 'single' && !selection.id) {
      const firstOperation = changeSet.operations[0];
      const createdId = firstOperation && 'value' in firstOperation ? firstOperation.value.id : undefined;
      if (createdId) setSelection(previous => ({ ...previous, id: createdId }));
    }
    setDirty(true); setIssues([]); setSummary('Valid change staged in memory. Export the replacement bank when ready.');
  };
  const stageDelete = async () => {
    if (!snapshot || !selection.id) return;
    const cascade = selection.kind !== 'question' && window.confirm('Cascade deletion to all child records? Cancel to reject this delete.');
    if (selection.kind !== 'question' && !cascade) return;
    if (!window.confirm(`Stage deletion of ${selection.kind} ${selection.id}?`)) return;
    const parsed = parseChangeSet({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: snapshot.revision }, reason, operations: [{ op: `${selection.kind}.delete`, id: selection.id, ...(cascade ? { cascade: true } : {}) }] });
    if (!parsed.changeSet) { setIssues(parsed.errors.map(message => ({ level: 'error', message }))); return; }
    const preview = await gateway.preview(parsed.changeSet);
    setIssues(preview.issues);
    setSummary(`${preview.summary.deletes} delete; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`);
    if (preview.issues.some(issue => issue.level === 'error')) return;
    const next = await gateway.apply(parsed.changeSet);
    setSnapshot(next); setSelection({ kind: 'subject' }); setEditor(''); setDirty(true); setIssues([]); setSummary('Deletion staged in memory. Export the replacement bank when ready.');
  };
  const undo = async () => { const next = await gateway.undo(); if (next) { setSnapshot(next); setDirty(gateway.appliedOperations().length > 0); setSummary('Last staged batch undone.'); } };
  const reset = async () => { if (!dirty || window.confirm('Discard every staged edit in this browser session?')) { const next = await gateway.reset(); setSnapshot(next); setDirty(false); setEditor(''); setIssues([]); setSummary('Reset to bundled canonical bank.'); } };
  const exportFiles = () => {
    if (!snapshot) return;
    const operations = gateway.appliedOperations();
    if (!operations.length) { setIssues([{ level: 'warning', message: 'There are no staged changes to export.' }]); return; }
    const exported: AdminChangeSet = { changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: originalRevision }, reason, operations };
    download('questionBank.generated.json', serializeBank(snapshot.bank));
    download('question-bank-change-set.json', `${JSON.stringify(exported, null, 2)}\n`);
    setDirty(false); setSummary('Downloaded the replacement bank and its review change set. Replace the repository file, then run content validation, tests, and build.');
  };

  if (!localAdminEnabled) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="warning">The JSON content admin is disabled in production builds. It is not an authentication mechanism.</Alert></Container>;
  if (!snapshot) return <Container sx={{ py: 8 }}><Typography>Loading canonical question bank…</Typography></Container>;

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 3 }}><Container maxWidth={false}>
    <Stack spacing={1} sx={{ mb: 3 }}><Typography variant="overline" color="primary.main" fontWeight={800}>Local developer tool</Typography><Typography variant="h3">Question bank admin</Typography><Typography color="text.secondary">JSON edits are staged only in this browser. Export both files and replace the canonical JSON through review; this panel does not save to the repository.</Typography></Stack>
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { lg: 300 }, p: 2, maxHeight: '72vh', overflow: 'auto' }}>
        <Stack spacing={1}><TextField label="Find subject" value={filter} onChange={event => setFilter(event.target.value)} size="small" /><ButtonGroup size="small"><Button onClick={() => loadNew('subject')}>New subject</Button><Button onClick={() => loadNew('quiz')}>New quiz</Button><Button onClick={() => loadNew('question')}>New item</Button></ButtonGroup></Stack>
        <List dense>{filteredSubjects.map(subject => <Box key={subject.id}><ListItemButton selected={selection.kind === 'subject' && selection.id === subject.id} onClick={() => loadEntity({ kind: 'subject', id: subject.id }, subject)}><ListItemText primary={subject.name} secondary={`${subject.id} · ${snapshot.bank.quizzes.filter(quiz => quiz.subjectId === subject.id).length} quizzes`} /></ListItemButton>
          {(selectedSubject?.id === subject.id || selection.parentId === subject.id) && visibleQuizzes.map(quiz => <ListItemButton key={quiz.id} sx={{ pl: 4 }} selected={selection.kind === 'quiz' && selection.id === quiz.id} onClick={() => loadEntity({ kind: 'quiz', id: quiz.id, parentId: subject.id }, quiz)}><ListItemText primary={quiz.name} secondary={quiz.id} /></ListItemButton>)}
        </Box>)}</List>
        {selectedQuiz && <><Divider /><Typography variant="caption" sx={{ display: 'block', mt: 1 }}>Items in {selectedQuiz.name}</Typography><List dense>{visibleQuestions.slice(0, 200).map(question => <ListItemButton key={question.id} selected={selection.kind === 'question' && selection.id === question.id} onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: selectedQuiz.id }, question)}><ListItemText primary={question.id} secondary={question.stem.slice(0, 64)} /></ListItemButton>)}</List>{visibleQuestions.length > 200 && <Typography variant="caption">Showing first 200 of {visibleQuestions.length}; use the browser search or select a different quiz.</Typography>}</>}
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}>
        <Tabs value={mode} onChange={(_, value) => { setMode(value); setEditor(value === 'bulk' ? JSON.stringify({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: snapshot.revision }, reason, operations: [] }, null, 2) : editor); }}><Tab value="single" label="Single JSON record" /><Tab value="bulk" label="Bulk change set" /></Tabs>
        <Stack spacing={2} sx={{ mt: 2 }}><TextField label="Change reason" value={reason} onChange={event => setReason(event.target.value)} required fullWidth />
          <TextField label={mode === 'single' ? `${selection.kind} JSON` : 'Change-set JSON'} value={editor} onChange={event => setEditor(event.target.value)} multiline minRows={20} fullWidth InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} placeholder={mode === 'single' ? 'Select an entity or create a template.' : 'Paste a version-1 change set.'} />
          <Stack direction="row" spacing={1} flexWrap="wrap"><Button variant="contained" onClick={stage}>{mode === 'single' ? 'Validate and stage record' : 'Validate and stage batch'}</Button>{mode === 'single' && selection.id && <Button color="error" onClick={stageDelete}>Delete selected</Button>}<Button onClick={undo}>Undo batch</Button><Button onClick={reset}>Reset</Button><Button color="success" onClick={exportFiles}>Export staged files</Button></Stack>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ width: { lg: 360 }, p: 2 }}><Stack spacing={2}><Typography variant="h6">Review</Typography><Stack direction="row" spacing={1}><Chip label={`${snapshot.bank.subjects.length} subjects`} /><Chip label={`${snapshot.bank.quizzes.length} quizzes`} /><Chip label={`${snapshot.bank.questions.length} items`} /></Stack><Alert severity={issues.some(issue => issue.level === 'error') ? 'error' : issues.length ? 'warning' : 'info'}>{summary}</Alert><TextField label="Validation details" value={issueText(issues)} multiline minRows={12} fullWidth InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} /><Alert severity={dirty ? 'warning' : 'success'}>{dirty ? 'Staged edits have not been exported.' : 'No unexported staged edits.'}</Alert></Stack></Paper>
    </Stack>
  </Container></Box>;
}
