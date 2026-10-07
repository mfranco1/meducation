import { useEffect, useRef, useState } from 'react';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import type { ValidationIssue } from '../content/validation/validate';
import { parseChangeSet } from './core/changeSetSchema';
import { compileBulkAddDraft, type BulkAddContext } from './core/bulkAddDraft';
import { serializeBank } from './core/serializeBank';
import { bulkAddTemplate, newQuestion, newQuiz, newSubject } from './core/templates';
import type { AdminChangeSet } from './core/types';
import type { AdminQuestionBankGateway } from './data/AdminQuestionBankGateway';
import { downloadJson } from './downloadJson';

export type EntityKind = 'subject' | 'quiz' | 'question';
export type Selection = { kind: EntityKind; id?: string; parentId?: string };
export type EditorMode = 'single' | 'bulk';
export interface PendingBulk {
  changeSet: AdminChangeSet;
  questionPaths: Record<string, string>;
  generatedIds: string[];
}
export interface ImportedChangeSet {
  text: string;
  changeSet: AdminChangeSet;
  issues: ValidationIssue[];
}
export type BulkTarget =
  | { kind: 'newSubject' }
  | { kind: 'subject'; subjectId?: string }
  | { kind: 'quiz'; subjectId?: string; quizId?: string };

/** Owns the mutable state shared by all admin editing workflows. */
export function useAdminEditor(gateway: AdminQuestionBankGateway, options: { confirm?: (message: string) => boolean; download?: (filename: string, content: string) => void } = {}) {
  const confirmAction = options.confirm ?? ((message: string) => window.confirm(message));
  const downloadFile = options.download ?? downloadJson;
  const [snapshot, setSnapshot] = useState<{ bank: StoredQuestionBank; revision: string }>();
  const [originalRevision, setOriginalRevision] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'subject' });
  const [mode, setMode] = useState<EditorMode>('single');
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local question-bank edit');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [summary, setSummary] = useState('Load a record or paste a change set.');
  const [dirty, setDirty] = useState(false);
  const [exported, setExported] = useState(false);
  const [filter, setFilter] = useState('');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk>();
  const [importedChangeSet, setImportedChangeSet] = useState<ImportedChangeSet>();
  const [bulkContext, setBulkContext] = useState<BulkAddContext>();
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>({ kind: 'newSubject' });
  const [busy, setBusy] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const busyRef = useRef(false);
  const editVersion = useRef(0);

  const selectedQuizId = selection.kind === 'quiz' ? selection.id : selection.kind === 'question' ? selection.parentId : undefined;
  const selectedQuiz = snapshot?.bank.quizzes.find(quiz => quiz.id === selectedQuizId);
  const selectedSubjectId = selection.kind === 'subject' ? selection.id : selectedQuiz?.subjectId;
  const selectedSubject = snapshot?.bank.subjects.find(subject => subject.id === selectedSubjectId);
  const hasAppliedChanges = gateway.appliedOperations().length > 0;
  const invalidateDraft = () => { editVersion.current += 1; setPendingBulk(undefined); setImportedChangeSet(undefined); };
  const runCommand = async (label: string, action: (isCurrent: () => boolean) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    const version = editVersion.current;
    try { await action(() => editVersion.current === version); }
    catch (error) {
      setIssues([{ level: 'error', message: error instanceof Error ? error.message : `${label} failed.` }]);
      setSummary(`${label} failed. No change was staged.`);
    } finally { busyRef.current = false; setBusy(undefined); }
  };

  useEffect(() => {
    let current = true;
    gateway.load().then(loaded => {
      if (!current) return;
      setSnapshot(loaded);
      setOriginalRevision(loaded.revision);
      setLoadError(undefined);
    }).catch(() => { if (current) setLoadError('Unable to load the canonical bank. Reload to try again.'); });
    return () => { current = false; };
  }, [gateway]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const loadEntity = (next: Selection, value: unknown) => {
    invalidateDraft();
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
  const loadBulkTemplate = (context: BulkAddContext) => {
    if (!snapshot) return;
    invalidateDraft();
    setBulkContext(context);
    setPendingBulk(undefined);
    setEditor(JSON.stringify(bulkAddTemplate(context), null, 2));
    setIssues([]);
    setSummary('Content-only template loaded. Edit the JSON, then validate it before staging.');
  };
  const chooseBulkTarget = (kind: BulkTarget['kind']) => {
    if (!snapshot) return;
    invalidateDraft();
    setMode('bulk');
    setPendingBulk(undefined);
    setIssues([]);
    if (kind === 'newSubject') {
      setBulkTarget({ kind });
      loadBulkTemplate({ kind, revision: snapshot.revision });
      return;
    }
    if (kind === 'subject') {
      const subjectId = selectedSubject?.id;
      setBulkTarget({ kind, subjectId });
      if (subjectId) loadBulkTemplate({ kind, subjectId, revision: snapshot.revision });
      else { setBulkContext(undefined); setEditor(''); setSummary('Choose a subject to add quizzes.'); }
      return;
    }
    const subjectId = selectedSubject?.id;
    const quizId = selectedQuiz?.id;
    setBulkTarget({ kind, subjectId, quizId });
    if (subjectId && quizId) loadBulkTemplate({ kind, subjectId, quizId, revision: snapshot.revision });
    else { setBulkContext(undefined); setEditor(''); setSummary('Choose a subject and quiz to add items.'); }
  };
  const chooseBulkSubject = (subjectId: string) => {
    if (!snapshot || bulkTarget.kind === 'newSubject') return;
    invalidateDraft();
    setPendingBulk(undefined);
    setIssues([]);
    if (bulkTarget.kind === 'subject') {
      setBulkTarget({ kind: 'subject', subjectId });
      loadBulkTemplate({ kind: 'subject', subjectId, revision: snapshot.revision });
      return;
    }
    setBulkTarget({ kind: 'quiz', subjectId });
    setBulkContext(undefined);
    setEditor('');
    setSummary('Choose a quiz to add items.');
  };
  const chooseBulkQuiz = (quizId: string) => {
    if (!snapshot || bulkTarget.kind !== 'quiz' || !bulkTarget.subjectId) return;
    invalidateDraft();
    const quiz = snapshot.bank.quizzes.find(candidate => candidate.id === quizId && candidate.subjectId === bulkTarget.subjectId);
    if (!quiz) return;
    setBulkTarget({ kind: 'quiz', subjectId: bulkTarget.subjectId, quizId });
    loadBulkTemplate({ kind: 'quiz', subjectId: bulkTarget.subjectId, quizId, revision: snapshot.revision });
  };
  const stageSingle = async (isCurrent: () => boolean) => {
    const changeSet = buildSingleChangeSet();
    if (!changeSet) return;
    const preview = await gateway.preview(changeSet);
    if (!isCurrent()) return;
    setIssues(preview.issues);
    setSummary(`${preview.summary.creates} create, ${preview.summary.updates} update, ${preview.summary.deletes} delete, ${preview.summary.moves} move; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`);
    if (preview.issues.some(issue => issue.level === 'error')) return;
    if ((preview.summary.cascadedQuizzes || preview.summary.cascadedQuestions) && !confirmAction('This change cascades to child records. Stage it?')) return;
    if (!isCurrent()) return;
    const next = await gateway.apply(changeSet);
    setSnapshot(next);
    if (mode === 'single' && !selection.id) {
      const firstOperation = changeSet.operations[0];
      const createdId = firstOperation && 'value' in firstOperation ? firstOperation.value.id : undefined;
      if (createdId) setSelection(previous => ({ ...previous, id: createdId }));
    }
    setDirty(true); setExported(false); setIssues([]); setSummary('Change staged. Export the updated bank and change set.');
  };
  const validateBulkDraft = async (isCurrent: () => boolean) => {
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
    if (!isCurrent()) return;
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
  const importChangeSetFile = async (file: File | undefined, isCurrent: () => boolean) => {
    if (!file || !snapshot) return;
    const text = await file.text();
    if (!isCurrent()) return;
    let input: unknown;
    try { input = JSON.parse(text); }
    catch {
      setImportedChangeSet(undefined);
      setIssues([{ level: 'error', message: 'Imported file is not valid JSON.' }]);
      setSummary('Imported change set is invalid.');
      return;
    }
    const parsed = parseChangeSet(input);
    if (!parsed.changeSet) {
      setImportedChangeSet(undefined);
      setIssues(parsed.errors.map(message => ({ level: 'error', message })));
      setSummary('Imported change set is invalid.');
      return;
    }
    const preview = await gateway.preview(parsed.changeSet);
    if (!isCurrent()) return;
    setImportedChangeSet({ text, changeSet: parsed.changeSet, issues: preview.issues });
    setIssues(preview.issues);
    setSummary(preview.issues.some(issue => issue.level === 'error') ? 'Imported change set failed preview.' : `Imported change set is valid: ${parsed.changeSet.operations.length} operation(s). Review it, then stage explicitly.`);
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
  const stageDelete = async (isCurrent: () => boolean) => {
    if (!snapshot || !selection.id) return;
    const cascade = selection.kind !== 'question' && confirmAction('Cascade deletion to all child records? Cancel to reject this delete.');
    if (selection.kind !== 'question' && !cascade) return;
    if (!confirmAction(`Stage deletion of ${selection.kind} ${selection.id}?`)) return;
    const parsed = parseChangeSet({ changeSetVersion: 1, base: { bankSchemaVersion: 4, revision: snapshot.revision }, reason, operations: [{ op: `${selection.kind}.delete`, id: selection.id, ...(cascade ? { cascade: true } : {}) }] });
    if (!parsed.changeSet) { setIssues(parsed.errors.map(message => ({ level: 'error', message }))); return; }
    const preview = await gateway.preview(parsed.changeSet);
    if (!isCurrent()) return;
    setIssues(preview.issues);
    setSummary(`${preview.summary.deletes} delete; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`);
    if (preview.issues.some(issue => issue.level === 'error')) return;
    const next = await gateway.apply(parsed.changeSet);
    setSnapshot(next); setSelection({ kind: 'subject' }); setEditor(''); setDirty(true); setExported(false); setIssues([]); setSummary('Deletion staged. Export the updated bank and change set.');
  };
  const undo = async () => { const next = await gateway.undo(); if (next) { setSnapshot(next); setDirty(gateway.appliedOperations().length > 0); setExported(false); setPendingBulk(undefined); setImportedChangeSet(undefined); setSummary('Last staged batch undone.'); } };
  const reset = async () => { if (!hasAppliedChanges || confirmAction('Discard every staged edit in this browser session?')) { const next = await gateway.reset(); setSnapshot(next); setDirty(false); setExported(false); setEditor(''); setPendingBulk(undefined); setImportedChangeSet(undefined); setBulkContext(undefined); setIssues([]); setSummary('Reset to bundled canonical bank.'); } };
  const exportFiles = () => {
    if (!snapshot) return;
    const operations = gateway.appliedOperations();
    if (!operations.length) { setIssues([{ level: 'warning', message: 'There are no staged changes to export.' }]); return; }
    const exported: AdminChangeSet = { changeSetVersion: 2, base: { bankSchemaVersion: 4, revision: originalRevision }, reason, operations };
    try {
      downloadFile('questionBank.generated.json', serializeBank(snapshot.bank));
      downloadFile('question-bank-change-set.json', `${JSON.stringify(exported, null, 2)}\n`);
      setDirty(false); setExported(true); setSummary('Downloaded the updated bank and review change set. Replace the canonical file through review.');
    } catch (error) {
      setIssues([{ level: 'error', message: error instanceof Error ? error.message : 'Export failed.' }]);
      setSummary('Export failed. Staged changes remain in this browser session.');
    }
  };

  const showSingle = () => { invalidateDraft(); setMode('single'); };
  const editRecord = (value: string) => { invalidateDraft(); setEditor(value); if (mode === 'bulk') { setIssues([]); setSummary('Draft changed. Validate again before staging.'); } };
  const editReason = (value: string) => { invalidateDraft(); setReason(value); if (mode === 'bulk') { setIssues([]); setSummary('Reason changed. Validate again before staging.'); } };

  const stageCoordinatedImport = async (changeSet: AdminChangeSet, flashcards: StoredFlashcardBank) => {
    if (busyRef.current) throw new Error('Wait for the current quiz authoring command to finish.');
    if (!gateway.applyCoordinated) throw new Error('This authoring adapter does not support coordinated imports.');
    if (editor.trim() && !confirmAction('Discard the current quiz editor draft and stage the reviewed coordinated import?')) throw new Error('The coordinated import was not staged; the quiz editor draft was kept.');
    busyRef.current = true; setBusy('Coordinated import');
    try {
      const next = await gateway.applyCoordinated(changeSet, flashcards);
      invalidateDraft(); setSnapshot(next); setReason(changeSet.reason); setDirty(true); setExported(false);
      setSelection({ kind: 'subject' }); setEditor(''); setIssues([]); setSummary('The validated quiz and flashcard snapshots were staged together.');
    } finally { busyRef.current = false; setBusy(undefined); }
  };

  const resetCoordinatedWorkspace = async (flashcards: StoredFlashcardBank) => {
    if (busyRef.current) throw new Error('Wait for the current quiz authoring command to finish.');
    if (!gateway.resetCoordinated) throw new Error('This authoring adapter does not support coordinated reset.');
    busyRef.current = true;
    setBusy('Coordinated reset');
    try {
      const next = await gateway.resetCoordinated(flashcards);
      invalidateDraft();
      setSnapshot(next); setDirty(false); setExported(false); setEditor('');
      setSelection({ kind: 'subject' }); setBulkContext(undefined); setIssues([]);
      setSummary('Both content banks were reset to bundled canonical content.');
    } finally { busyRef.current = false; setBusy(undefined); }
  };

  return {
    snapshot, originalRevision, selection, mode, editor, reason, issues, summary,
    dirty, exported, filter, setFilter, pendingBulk, importedChangeSet,
    bulkContext, bulkTarget, busy, loadError, selectedQuiz, selectedSubject, hasAppliedChanges,
    loadEntity, loadNew, chooseBulkTarget, chooseBulkSubject, chooseBulkQuiz,
    showSingle, editRecord, editReason,
    stageCoordinatedImport,
    resetCoordinatedWorkspace,
    markCoordinatedExport: () => { setDirty(false); setExported(true); setSummary('Downloaded the coordinated content bundle and both canonical bank snapshots.'); },
    stageSingle: () => runCommand('Stage', stageSingle),
    validateBulkDraft: () => runCommand('Validation', validateBulkDraft),
    stageValidatedBulk: () => runCommand('Stage', stageValidatedBulk),
    importChangeSetFile: (file?: File) => runCommand('Import', isCurrent => importChangeSetFile(file, isCurrent)),
    stageImportedChangeSet: () => runCommand('Stage', stageImportedChangeSet),
    stageDelete: () => runCommand('Delete', stageDelete),
    undo: () => runCommand('Undo', undo),
    reset: () => runCommand('Reset', reset),
    exportFiles: () => { if (!busyRef.current) exportFiles(); },
  };
}
