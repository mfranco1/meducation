import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Container, Divider, List, ListItemButton, ListItemText, Menu,
  MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { storedQuestionBank } from '../content/questionBank';
import type { StoredQuestionBank } from '../content/schema';
import type { ValidationIssue } from '../content/validate';
import { parseChangeSet } from './core/changeSetSchema';
import { compileBulkAddDraft, type BulkAddContext } from './core/bulkAddDraft';
import { serializeBank } from './core/serializeBank';
import { bulkAddTemplate, newQuestion, newQuiz, newSubject } from './core/templates';
import type { AdminChangeSet } from './core/types';
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

function issueLines(issues: ValidationIssue[], questionPaths: Record<string, string> = {}) {
  return issues.map(issue => {
    const path = issue.questionId ? questionPaths[issue.questionId] : undefined;
    return `${issue.level.toUpperCase()}${path ? ` ${path}` : issue.questionId ? ` [${issue.questionId}]` : ''}: ${issue.message}`;
  });
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
  const [exported, setExported] = useState(false);
  const [filter, setFilter] = useState('');
  const [bulkContext, setBulkContext] = useState<BulkAddContext>();
  const [pendingBulk, setPendingBulk] = useState<{ changeSet: AdminChangeSet; questionPaths: Record<string, string>; generatedIds: string[] }>();
  const [importedChangeSet, setImportedChangeSet] = useState<{ text: string; changeSet: AdminChangeSet; issues: ValidationIssue[] }>();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => { gateway.load().then(loaded => { setSnapshot(loaded); setOriginalRevision(loaded.revision); }); }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const selectedQuizId = selection.kind === 'quiz' ? selection.id : selection.kind === 'question' ? selection.parentId : undefined;
  const selectedQuiz = snapshot?.bank.quizzes.find(quiz => quiz.id === selectedQuizId);
  const selectedSubjectId = selection.kind === 'subject' ? selection.id : selectedQuiz?.subjectId;
  const selectedSubject = snapshot?.bank.subjects.find(subject => subject.id === selectedSubjectId);
  const filteredSubjects = useMemo(() => snapshot?.bank.subjects.filter(subject => `${subject.id} ${subject.name}`.toLowerCase().includes(filter.toLowerCase())) ?? [], [snapshot, filter]);
  const visibleQuizzes = useMemo(() => !snapshot ? [] : snapshot.bank.quizzes.filter(quiz => quiz.subjectId === selection.parentId || quiz.subjectId === selectedSubject?.id), [snapshot, selection.parentId, selectedSubject?.id]);
  const visibleQuestions = useMemo(() => !snapshot ? [] : snapshot.bank.questions.filter(question => question.quizId === selection.parentId || question.quizId === selectedQuiz?.id), [snapshot, selection.parentId, selectedQuiz?.id]);
  const appliedOperations = gateway.appliedOperations();
  const hasAppliedChanges = appliedOperations.length > 0;
  const hasErrors = issues.some(issue => issue.level === 'error');
  const hasWarnings = issues.some(issue => issue.level === 'warning');

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
  const setBulkTemplate = (kind: 'newSubject' | 'subject' | 'quiz') => {
    if (!snapshot) return;
    const context: BulkAddContext = kind === 'newSubject'
      ? { kind, revision: snapshot.revision }
      : kind === 'subject' && selectedSubject
        ? { kind, subjectId: selectedSubject.id, revision: snapshot.revision }
        : selectedQuiz && selectedSubject
          ? { kind: 'quiz', subjectId: selectedSubject.id, quizId: selectedQuiz.id, revision: snapshot.revision }
          : { kind: 'newSubject', revision: snapshot.revision };
    setBulkContext(context);
    setPendingBulk(undefined);
    setMode('bulk');
    setEditor(JSON.stringify(bulkAddTemplate(context), null, 2));
    setIssues([]);
    setSummary('Content-only template loaded. Edit the JSON, then validate it before staging.');
  };
  const stageSingle = async () => {
    const changeSet = buildSingleChangeSet();
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
    setDirty(true); setExported(false); setIssues([]); setSummary('Change staged. Export the updated bank and change set.');
  };
  const validateBulkDraft = async () => {
    if (!snapshot || !bulkContext) { setIssues([{ level: 'error', message: 'Choose a bulk-add destination template first.' }]); return; }
    let draft: unknown;
    try { draft = JSON.parse(editor); }
    catch { setPendingBulk(undefined); setIssues([{ level: 'error', message: 'Draft JSON is invalid.' }]); return; }
    const result = compileBulkAddDraft(draft, bulkContext, snapshot.bank, snapshot.revision, reason);
    if (!result.compiled) {
      setPendingBulk(undefined);
      setIssues(result.errors.map(message => ({ level: 'error', message })));
      setSummary('Draft has errors. Correct the listed fields before staging.');
      return;
    }
    const preview = await gateway.preview(result.compiled.changeSet);
    setIssues(preview.issues);
    if (preview.issues.some(issue => issue.level === 'error')) {
      setPendingBulk(undefined);
      setSummary('Draft did not pass bank validation. No changes were staged.');
      return;
    }
    setPendingBulk({ ...result.compiled });
    setSummary(`Ready to stage: ${result.compiled.generatedIds.length} new record(s). Review generated IDs and warnings, then confirm.`);
  };
  const stageValidatedBulk = async () => {
    if (!pendingBulk) return;
    try {
      const next = await gateway.apply(pendingBulk.changeSet);
      setSnapshot(next); setDirty(true); setExported(false); setPendingBulk(undefined); setIssues([]);
      setSummary('Bulk add staged. Export the updated bank and change set.');
    } catch (error) {
      setPendingBulk(undefined);
      setIssues([{ level: 'error', message: error instanceof Error ? error.message : 'The staged draft is no longer current.' }]);
      setSummary('Bulk add could not be staged. Reload the template against the current snapshot.');
    }
  };
  const importChangeSetFile = async (file?: File) => {
    if (!file || !snapshot) return;
    const text = await file.text();
    try {
      const parsed = parseChangeSet(JSON.parse(text));
      if (!parsed.changeSet) {
        setImportedChangeSet(undefined);
        setIssues(parsed.errors.map(message => ({ level: 'error', message })));
        setSummary('Imported change set is invalid.');
        return;
      }
      const preview = await gateway.preview(parsed.changeSet);
      setImportedChangeSet({ text, changeSet: parsed.changeSet, issues: preview.issues });
      setIssues(preview.issues);
      setSummary(preview.issues.some(issue => issue.level === 'error') ? 'Imported change set failed preview.' : `Imported change set is valid: ${parsed.changeSet.operations.length} operation(s). Review it, then stage explicitly.`);
    } catch {
      setImportedChangeSet(undefined);
      setIssues([{ level: 'error', message: 'Imported file is not valid JSON.' }]);
      setSummary('Imported change set is invalid.');
    }
  };
  const stageImportedChangeSet = async () => {
    if (!importedChangeSet || importedChangeSet.issues.some(issue => issue.level === 'error')) return;
    try {
      const next = await gateway.apply(importedChangeSet.changeSet);
      setSnapshot(next); setDirty(true); setExported(false); setImportedChangeSet(undefined); setIssues([]);
      setSummary('Import staged. Export the updated bank and change set.');
    } catch (error) {
      setImportedChangeSet(undefined);
      setIssues([{ level: 'error', message: error instanceof Error ? error.message : 'Imported change set is no longer current.' }]);
      setSummary('Imported change set could not be staged.');
    }
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
    setSnapshot(next); setSelection({ kind: 'subject' }); setEditor(''); setDirty(true); setExported(false); setIssues([]); setSummary('Deletion staged. Export the updated bank and change set.');
  };
  const undo = async () => { const next = await gateway.undo(); if (next) { setSnapshot(next); setDirty(gateway.appliedOperations().length > 0); setExported(false); setPendingBulk(undefined); setImportedChangeSet(undefined); setSummary('Last staged batch undone.'); } };
  const reset = async () => { if (!hasAppliedChanges || window.confirm('Discard every staged edit in this browser session?')) { const next = await gateway.reset(); setSnapshot(next); setDirty(false); setExported(false); setEditor(''); setPendingBulk(undefined); setImportedChangeSet(undefined); setBulkContext(undefined); setIssues([]); setSummary('Reset to bundled canonical bank.'); } };
  const exportFiles = () => {
    if (!snapshot) return;
    const operations = gateway.appliedOperations();
    if (!operations.length) { setIssues([{ level: 'warning', message: 'There are no staged changes to export.' }]); return; }
    const exported: AdminChangeSet = { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: originalRevision }, reason, operations };
    download('questionBank.generated.json', serializeBank(snapshot.bank));
    download('question-bank-change-set.json', `${JSON.stringify(exported, null, 2)}\n`);
    setDirty(false); setExported(true); setSummary('Downloaded the updated bank and review change set. Replace the canonical file through review.');
  };

  const bulkTargetLabel = bulkContext?.kind === 'newSubject'
    ? 'New subject'
    : bulkContext?.kind === 'subject'
      ? selectedSubject?.name ?? 'Selected subject'
      : selectedSubject && selectedQuiz
        ? `${selectedSubject.name} / ${selectedQuiz.name}`
        : 'Selected quiz';

  if (!localAdminEnabled) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="warning">The JSON content admin is disabled in production builds. It is not an authentication mechanism.</Alert></Container>;
  if (!snapshot) return <Container sx={{ py: 8 }}><Typography>Loading canonical question bank…</Typography></Container>;

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <Box component="header" sx={{ py: 1.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}>
      <Container maxWidth={false}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={.75} sx={{ color: 'text.primary', fontSize: 20, letterSpacing: '-.04em', fontWeight: 700 }}><MenuBookRoundedIcon sx={{ color: 'primary.main' }} /><Box component="span"><Box component="span" sx={{ color: 'primary.main' }}>Med</Box>ucation</Box></Stack>
          <Typography variant="body2" color="text.secondary">Admin</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Changes stay local until export.</Typography>
          <Button size="small" onClick={() => importFileRef.current?.click()}>Import</Button>
          <Button size="small" color="success" variant="contained" disabled={!hasAppliedChanges} onClick={exportFiles}>Export</Button>
          <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={event => { void importChangeSetFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
        </Stack>
      </Stack></Container>
    </Box>
    <Container maxWidth={false} sx={{ py: 2 }}>
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Paper variant="outlined" sx={{ width: { lg: 300 }, p: 2, maxHeight: { lg: '78vh' }, overflow: 'auto' }}>
        <Stack spacing={1}><TextField label="Search" inputProps={{ 'aria-label': 'Search subjects' }} value={filter} onChange={event => setFilter(event.target.value)} size="small" /><Button size="small" aria-haspopup="menu" aria-expanded={Boolean(addMenuAnchor)} onClick={event => setAddMenuAnchor(event.currentTarget)}>Add</Button>
          <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)}>
            <MenuItem onClick={() => { setAddMenuAnchor(null); loadNew('subject'); }}>Subject</MenuItem>
            <MenuItem disabled={!selectedSubject} onClick={() => { setAddMenuAnchor(null); loadNew('quiz'); }}>Quiz</MenuItem>
            <MenuItem disabled={!selectedQuiz} onClick={() => { setAddMenuAnchor(null); loadNew('question'); }}>Item</MenuItem>
          </Menu>
        </Stack>
        <List dense>{filteredSubjects.map(subject => <Box key={subject.id}><ListItemButton selected={selection.kind === 'subject' && selection.id === subject.id} onClick={() => loadEntity({ kind: 'subject', id: subject.id }, subject)}><ListItemText primary={subject.name} secondary={`${subject.id} · ${snapshot.bank.quizzes.filter(quiz => quiz.subjectId === subject.id).length} quizzes`} /></ListItemButton>
          {(selectedSubject?.id === subject.id || selection.parentId === subject.id) && visibleQuizzes.map(quiz => <ListItemButton key={quiz.id} sx={{ pl: 4 }} selected={selection.kind === 'quiz' && selection.id === quiz.id} onClick={() => loadEntity({ kind: 'quiz', id: quiz.id, parentId: subject.id }, quiz)}><ListItemText primary={quiz.name} secondary={quiz.id} /></ListItemButton>)}
        </Box>)}</List>
        {selectedQuiz && <><Divider /><Typography variant="caption" sx={{ display: 'block', mt: 1 }}>{selectedQuiz.name} · {visibleQuestions.length} items</Typography><List dense>{visibleQuestions.slice(0, 200).map(question => <ListItemButton key={question.id} selected={selection.kind === 'question' && selection.id === question.id} onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: selectedQuiz.id }, question)}><ListItemText primary={question.id} secondary={question.stem.slice(0, 64)} /></ListItemButton>)}</List>{visibleQuestions.length > 200 && <Typography variant="caption">Showing first 200 of {visibleQuestions.length}; use the browser search or select a different quiz.</Typography>}</>}
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}>
        <Tabs value={mode} onChange={(_, value) => {
          if (value === 'bulk') setBulkTemplate(selection.kind === 'question' || selection.kind === 'quiz'
            ? 'quiz' : selection.kind === 'subject' && selection.id ? 'subject' : 'newSubject');
          else { setMode('single'); setPendingBulk(undefined); }
        }}><Tab value="single" label="Record" /><Tab value="bulk" label="Bulk add" /></Tabs>
        {mode === 'bulk' && <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Button size="small" onClick={() => setBulkTemplate('newSubject')}>New subject</Button>
          <Button size="small" disabled={!selectedSubject} onClick={() => setBulkTemplate('subject')}>Add quizzes</Button>
          <Button size="small" disabled={!selectedQuiz} onClick={() => setBulkTemplate('quiz')}>Add items</Button>
        </Stack>}
        <Stack spacing={2} sx={{ mt: 2 }}><TextField label="Reason" value={reason} onChange={event => { setReason(event.target.value); if (mode === 'bulk') { setPendingBulk(undefined); setIssues([]); setSummary('Reason changed. Validate again before staging.'); } if (importedChangeSet) setImportedChangeSet(undefined); }} required fullWidth />
          {mode === 'bulk' && <Alert severity="info">{bulkTargetLabel}</Alert>}
          <TextField label="JSON" value={editor} onChange={event => { setEditor(event.target.value); if (mode === 'bulk') { setPendingBulk(undefined); setIssues([]); setSummary('Draft changed. Validate again before staging.'); } }} multiline minRows={20} fullWidth InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} placeholder={mode === 'single' ? 'Select an entity or create a template.' : 'Edit subject, quiz, and item content.'} />
          {mode === 'bulk' && <Typography variant="caption" color="text.secondary">Items need stem, 2–26 choice strings, answer label, and rationale. Optional content fields: verifiedAnswer, answerNote, rationaleMeta, choiceExplanations, pearls, metadata.</Typography>}
          <Stack direction="row" spacing={1} flexWrap="wrap"><Button variant="contained" onClick={mode === 'single' ? stageSingle : validateBulkDraft}>{mode === 'single' ? 'Stage' : 'Validate'}</Button>{mode === 'bulk' && pendingBulk && <Button color="success" variant="contained" onClick={stageValidatedBulk}>Stage</Button>}{mode === 'single' && selection.id && <Button color="error" onClick={stageDelete}>Delete</Button>}<Divider flexItem orientation="vertical" sx={{ mx: .5 }} /><Button disabled={!hasAppliedChanges} onClick={undo}>Undo</Button><Button disabled={!hasAppliedChanges} onClick={reset}>Reset</Button></Stack>
          {pendingBulk && <Alert severity={issues.some(issue => issue.level === 'error') ? 'error' : issues.some(issue => issue.level === 'warning') ? 'warning' : 'success'}>
            <Typography variant="body2">{pendingBulk.generatedIds.length} generated IDs: {pendingBulk.generatedIds.join(', ')}</Typography>
          </Alert>}
          {importedChangeSet && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}><Typography variant="subtitle1">Import preview</Typography><TextField value={importedChangeSet.text} multiline minRows={8} fullWidth InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} /><Button variant="contained" disabled={importedChangeSet.issues.some(issue => issue.level === 'error')} onClick={stageImportedChangeSet}>Stage import</Button></Stack></Paper>}
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ width: { lg: 280 }, p: 2, alignSelf: 'flex-start' }} aria-label="Admin status"><Stack spacing={1.5}><Typography variant="subtitle2" color="text.secondary">{snapshot.bank.subjects.length} subjects · {snapshot.bank.quizzes.length} quizzes · {snapshot.bank.questions.length} items</Typography>
        <Typography fontWeight={700} color={hasErrors ? 'error.main' : hasWarnings ? 'warning.dark' : dirty ? 'warning.dark' : 'success.main'}>{hasErrors ? 'Needs attention' : hasWarnings ? 'Review warnings' : dirty ? 'Not exported' : exported ? 'Exported' : 'No changes'}</Typography>
        {summary !== 'Load a record or paste a change set.' && <Typography variant="body2" color="text.secondary">{summary}</Typography>}
        {issues.length > 0 && <List dense disablePadding aria-label="Validation issues">{issueLines(issues, pendingBulk?.questionPaths).map((line, index) => <ListItemText key={`${index}-${line}`} primary={line} primaryTypographyProps={{ variant: 'body2', color: issues[index]?.level === 'error' ? 'error.main' : issues[index]?.level === 'warning' ? 'warning.dark' : 'text.secondary' }} />)}</List>}
      </Stack></Paper>
    </Stack>
    </Container></Box>;
}
