import { adoptReservedDraftId, newQuestion, newQuiz, newSubject } from './core/recordDraft';
import { AdminActionCanceled } from './data/PairedHttpClient';
import { useAdminConfirmation } from './useAdminConfirmation';
import { useEffect, useRef, useState } from 'react';
import type { StoredFlashcardBank } from '../content/schema/schema';
import type { ValidationIssue } from '../content/validation/validate';
import { parseChangeSet } from './core/changeSetSchema';
import { bulkAddTemplate, compileBulkAddDraft, type BulkAddContext } from './core/bulkAddDraft';
import type { AdminBankSnapshot, AdminChangeSet } from './core/types';
import type { HttpQuestionBankGateway } from './data/HttpQuestionBankGateway';

export type EntityKind = 'subject' | 'quiz' | 'question';
export type Selection = { kind: EntityKind; id?: string; parentId?: string };
export type EditorMode = 'single' | 'bulk';
export interface PendingBulk {
  changeSet: AdminChangeSet;
  questionPaths: Record<string, string>;
  generatedIds: string[];
}
export type BulkTarget =
  | { kind: 'newSubject' }
  | { kind: 'subject'; subjectId?: string }
  | { kind: 'quiz'; subjectId?: string; quizId?: string };

/** Owns the mutable state shared by all admin editing workflows. */
export function useAdminEditor(
  gateway: HttpQuestionBankGateway,
  options: { confirm?: (message: string) => boolean; blocked?: boolean; draftLabel?: string } = {},
) {
  const [snapshot, setSnapshot] = useState<AdminBankSnapshot>();
  const [selection, setSelection] = useState<Selection>({ kind: 'subject' });
  const [mode, setMode] = useState<EditorMode>('single');
  const [editor, setEditor] = useState('');
  const [loadedEditor, setLoadedEditor] = useState('');
  const editorDirty = editor !== loadedEditor;
  const [reason, setReason] = useState('Question-bank edit');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [summary, setSummary] = useState('Load a record or add content.');
  const [filter, setFilter] = useState('');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk>();
  const [bulkContext, setBulkContext] = useState<BulkAddContext>();
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>({ kind: 'newSubject' });
  const [busy, setBusy] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const confirmation = useAdminConfirmation([editor, reason, snapshot, options.blocked]);
  const confirmAction = options.confirm ?? confirmation.request;
  const busyRef = useRef(false);
  const editVersion = useRef(0);
  const selectedQuizId =
    selection.kind === 'quiz' ? selection.id : selection.kind === 'question' ? selection.parentId : undefined;
  const selectedQuiz = snapshot?.bank.quizzes.find((quiz) => quiz.id === selectedQuizId);
  const selectedSubjectId = selection.kind === 'subject' ? selection.id : selectedQuiz?.subjectId;
  const selectedSubject = snapshot?.bank.subjects.find((subject) => subject.id === selectedSubjectId);
  const invalidateDraft = () => {
    gateway.invalidate();
    editVersion.current += 1;
    setPendingBulk(undefined);
  };
  const runCommand = async (label: string, action: (isCurrent: () => boolean) => Promise<void | boolean>) => {
    if (busyRef.current || options.blocked) return false;
    busyRef.current = true;
    setBusy(label);
    const version = editVersion.current;
    try {
      return await action(() => editVersion.current === version);
    } catch (error) {
      if (error instanceof AdminActionCanceled) {
        setIssues([]);
        setSummary(error.message);
        return 'canceled' as const;
      }
      setIssues([{ level: 'error', message: error instanceof Error ? error.message : `${label} failed.` }]);
      setSummary('Request failed. Your text is kept; reconcile uncertain operations before a new write.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  };

  useEffect(() => {
    let current = true;
    const load = () => gateway.load().then((loaded) => {
      if (!current) return;
      setSnapshot(loaded);
      setPendingBulk(undefined);
      setLoadError(undefined);
    }).catch(() => {
      if (current) setLoadError('Unable to load the canonical bank. Reload to try again.');
    });
    void load();
    const unsubscribe = gateway.subscribe(() => { void load(); });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [gateway]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!editorDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [editorDirty]);

  const discardDraft = () =>
    confirmAction(`Discard the unsaved ${options.draftLabel ?? 'quiz editor'} text to continue?`);
  const browseContext = async (subjectId: string, quizId?: string) => {
    if (busyRef.current || options.blocked || (editorDirty && !(await discardDraft()))) return false;
    invalidateDraft();
    setSelection(
      quizId ? { kind: 'quiz', id: quizId, parentId: subjectId } : { kind: 'subject', id: subjectId || undefined },
    );
    setEditor('');
    setLoadedEditor('');
    setMode('single');
    setIssues([]);
    return true;
  };
  const loadEntity = async (next: Selection, value: unknown) => {
    if (busyRef.current || options.blocked || (editorDirty && !(await discardDraft()))) return false;
    invalidateDraft();
    const text = JSON.stringify(value, null, 2);
    setSelection(next);
    setMode('single');
    setEditor(text);
    setLoadedEditor(text);
    setIssues([]);
    setSummary('');
    return true;
  };
  const loadNew = (kind: EntityKind) => {
    if (!snapshot) return;
    const value =
      kind === 'subject'
        ? newSubject(snapshot.bank)
        : kind === 'quiz'
          ? newQuiz(snapshot.bank, selectedSubject?.id ?? selection.parentId ?? '')
          : newQuestion(snapshot.bank, selectedQuiz?.id ?? selection.parentId ?? '');
    loadEntity(
      {
        kind,
        parentId:
          kind === 'quiz'
            ? (value as { subjectId: string }).subjectId
            : kind === 'question'
              ? (value as { quizId: string }).quizId
              : undefined,
      },
      value,
    );
  };

  const buildSingleChangeSet = (): AdminChangeSet | undefined => {
    if (!snapshot) return undefined;
    try {
      const value = JSON.parse(editor) as Record<string, unknown>;
      const creating = !selection.id;
      const operation: unknown = creating
        ? { op: `${selection.kind}.create`, value }
        : { op: `${selection.kind}.update`, id: selection.id, value };
      const parsed = parseChangeSet({
        changeSetVersion: 2,
        base: { bankSchemaVersion: 4, revision: snapshot.revision },
        reason,
        operations: [operation],
      });
      if (!parsed.changeSet) {
        setIssues(parsed.errors.map((message) => ({ level: 'error', message })));
        return undefined;
      }
      return parsed.changeSet;
    } catch {
      setIssues([{ level: 'error', message: 'Record JSON is invalid.' }]);
      return undefined;
    }
  };
  const loadBulkTemplate = (context: BulkAddContext) => {
    if (!snapshot) return;
    invalidateDraft();
    setBulkContext(context);
    setPendingBulk(undefined);
    const text = JSON.stringify(bulkAddTemplate(context), null, 2);
    setEditor(text);
    setLoadedEditor(text);
    setIssues([]);
    setSummary('');
  };
  const chooseBulkTarget = async (kind: BulkTarget['kind'], context?: { subjectId?: string; quizId?: string }) => {
    if (!snapshot || busyRef.current || options.blocked || (editorDirty && !(await discardDraft()))) return;
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
      const subjectId = context?.subjectId ?? selectedSubject?.id;
      setBulkTarget({ kind, subjectId });
      if (subjectId) loadBulkTemplate({ kind, subjectId, revision: snapshot.revision });
      else {
        setBulkContext(undefined);
        setEditor('');
        setLoadedEditor('');
        setSummary('Choose a subject to add quizzes.');
      }
      return;
    }
    const subjectId = context?.subjectId ?? selectedSubject?.id;
    const quizId = context?.quizId ?? selectedQuiz?.id;
    setBulkTarget({ kind, subjectId, quizId });
    if (subjectId && quizId) loadBulkTemplate({ kind, subjectId, quizId, revision: snapshot.revision });
    else {
      setBulkContext(undefined);
      setEditor('');
      setLoadedEditor('');
      setSummary('Choose a subject and quiz to add items.');
    }
  };
  const chooseBulkSubject = async (subjectId: string) => {
    if (
      !snapshot ||
      bulkTarget.kind === 'newSubject' ||
      busyRef.current ||
      options.blocked ||
      (editorDirty && !(await discardDraft()))
    )
      return;
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
    setLoadedEditor('');
    setSummary('Choose a quiz to add items.');
  };
  const chooseBulkQuiz = async (quizId: string) => {
    if (
      !snapshot ||
      bulkTarget.kind !== 'quiz' ||
      !bulkTarget.subjectId ||
      busyRef.current ||
      options.blocked ||
      (editorDirty && !(await discardDraft()))
    )
      return;
    invalidateDraft();
    const quiz = snapshot.bank.quizzes.find(
      (candidate) => candidate.id === quizId && candidate.subjectId === bulkTarget.subjectId,
    );
    if (!quiz) return;
    setBulkTarget({ kind: 'quiz', subjectId: bulkTarget.subjectId, quizId });
    loadBulkTemplate({ kind: 'quiz', subjectId: bulkTarget.subjectId, quizId, revision: snapshot.revision });
  };
  const stageSingle = async (isCurrent: () => boolean) => {
    let changeSet = buildSingleChangeSet();
    if (!changeSet) return;
    const initialOperation = changeSet.operations[0];
    const provisionalId = initialOperation && 'value' in initialOperation ? initialOperation.value.id : undefined;
    const preview = await gateway.preview(changeSet);
    if (!isCurrent()) return;
    setIssues(preview.issues);
    setSummary(
      `${preview.summary.creates} create, ${preview.summary.updates} update, ${preview.summary.deletes} delete, ${preview.summary.moves} move; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`,
    );
    if (preview.issues.some((issue) => issue.level === 'error')) return;
    if (!isCurrent()) return;
    changeSet = preview.preparedChangeSet ?? changeSet;
    const next = await gateway.apply(changeSet);
    setSnapshot(next);
    if (mode === 'single' && !selection.id) {
      const firstOperation = changeSet.operations[0];
      const createdId = firstOperation && 'value' in firstOperation ? firstOperation.value.id : undefined;
      if (createdId) setSelection((previous) => ({ ...previous, id: createdId }));
    }
    const operation = changeSet.operations[0];
    const savedText = operation && 'value' in operation ? JSON.stringify(operation.value, null, 2) : editor;
    setLoadedEditor(savedText);
    if (isCurrent()) setEditor(savedText);
    else if (!selection.id && provisionalId && operation && 'value' in operation) {
      const reservedId = operation.value.id;
      setEditor((latest) => adoptReservedDraftId(latest, provisionalId, reservedId));
    }
    setIssues([]);
    setSummary('Paired draft saved. Saving does not publish.');
    return true;
  };
  const validateBulkDraft = async (isCurrent: () => boolean) => {
    if (!snapshot || !bulkContext) {
      setIssues([{ level: 'error', message: 'Choose a bulk-add destination template first.' }]);
      return;
    }
    let draft: unknown;
    try {
      draft = JSON.parse(editor);
    } catch {
      setPendingBulk(undefined);
      setIssues([{ level: 'error', message: 'Draft JSON is invalid.' }]);
      return;
    }
    const result = compileBulkAddDraft(draft, bulkContext, snapshot.bank, snapshot.revision, reason);
    if (!result.compiled) {
      setPendingBulk(undefined);
      setIssues(result.errors.map((message) => ({ level: 'error', message })));
      setSummary('Draft has errors. Correct the listed fields before saving.');
      return;
    }
    const preview = await gateway.preview(result.compiled.changeSet);
    if (!isCurrent()) return;
    setIssues(preview.issues);
    if (preview.issues.some((issue) => issue.level === 'error')) {
      setPendingBulk(undefined);
      setSummary('Draft did not pass bank validation. No changes were saved.');
      return;
    }
    setPendingBulk({
      ...result.compiled,
      changeSet: preview.preparedChangeSet ?? result.compiled.changeSet,
      questionPaths: Object.fromEntries(
        Object.entries(result.compiled.questionPaths).map(([id, path]) => [preview.idMappings?.[id] ?? id, path]),
      ),
      generatedIds: result.compiled.generatedIds.map((id) => preview.idMappings?.[id] ?? id),
    });
    setSummary(
      `Preview ready: ${result.compiled.generatedIds.length} new record(s). Review generated IDs and warnings, then save.`,
    );
  };
  const stageValidatedBulk = async (isCurrent: () => boolean) => {
    if (!pendingBulk) return;
    try {
      const next = await gateway.apply(pendingBulk.changeSet);
      setLoadedEditor(editor);
      setSnapshot(next);
      setPendingBulk(undefined);
      setIssues([]);
      setSummary(
        isCurrent()
          ? 'Paired draft saved. Saving does not publish.'
          : 'The captured batch was saved. Newer text is kept. Review or remove already saved entries before another batch save.',
      );
    } catch (error) {
      if (error instanceof AdminActionCanceled) {
        setIssues([]);
        setSummary(error.message);
        return false;
      }
      setPendingBulk(undefined);
      setIssues([
        {
          level: 'error',
          message: error instanceof Error ? error.message : 'The reviewed draft is no longer current.',
        },
      ]);
      setSummary('Bulk add could not be saved. Reload the template against the current snapshot.');
    }
  };
  const stageDelete = async (
    isCurrent: () => boolean,
    target: Selection = selection,
    changeReason = reason,
    ids?: string[],
    expectedRevision?: string,
  ) => {
    if (!snapshot || (!target.id && !ids?.length)) return false;
    if (editorDirty && !(await discardDraft()))
      throw new AdminActionCanceled('Deletion canceled; unsaved text is kept.');
    if (expectedRevision && expectedRevision !== snapshot.revision)
      throw new Error('The deletion review is stale. Review the current content again.');
    const targets = [...new Set(ids ?? [target.id!])];
    if (
      ids &&
      (target.kind !== 'question' ||
        targets.some((id) => !snapshot.bank.questions.some((row) => row.id === id && row.quizId === target.parentId)))
    )
      throw new Error('The selected items no longer belong to this quiz.');
    const cascade = target.kind !== 'question';
    const parsed = parseChangeSet({
      changeSetVersion: 2,
      base: { bankSchemaVersion: 4, revision: snapshot.revision },
      reason: changeReason,
      operations: targets.map((id) => ({ op: `${target.kind}.delete`, id, ...(cascade ? { cascade: true } : {}) })),
    });
    if (!parsed.changeSet) {
      setIssues(parsed.errors.map((message) => ({ level: 'error', message })));
      return false;
    }
    const preview = await gateway.preview(parsed.changeSet);
    if (!isCurrent()) return;
    setIssues(preview.issues);
    setSummary(
      `${preview.summary.deletes} delete; cascade impact: ${preview.summary.cascadedQuizzes} quiz(zes), ${preview.summary.cascadedQuestions} item(s).`,
    );
    if (preview.issues.some((issue) => issue.level === 'error')) return;
    const next = await gateway.apply(preview.preparedChangeSet ?? parsed.changeSet);
    setSnapshot(next);
    if (isCurrent()) {
      setSelection(
        target.kind === 'question'
          ? { kind: 'quiz', id: target.parentId }
          : target.kind === 'quiz'
            ? { kind: 'subject', id: target.parentId }
            : { kind: 'subject' },
      );
      setEditor('');
      setLoadedEditor('');
    }
    setIssues([]);
    setSummary('Paired draft saved. Saving does not publish.');
    return true;
  };
  const showSingle = async () => {
    if (busyRef.current || options.blocked || (editorDirty && !(await discardDraft()))) return;
    invalidateDraft();
    setMode('single');
  };
  const editRecord = (value: string) => {
    invalidateDraft();
    setEditor(value);
    if (mode === 'bulk') {
      setIssues([]);
      setSummary('Draft changed. Preview again before saving.');
    }
  };
  const editReason = (value: string) => {
    invalidateDraft();
    setReason(value);
    if (mode === 'bulk') {
      setIssues([]);
      setSummary('Reason changed. Validate again before saving.');
    }
  };

  const savePairedChange = async (changeSet: AdminChangeSet, flashcards: StoredFlashcardBank) => {
    if (busyRef.current || options.blocked) throw new Error('Wait for the current quiz authoring command to finish.');
    if (
      editorDirty &&
      !(await confirmAction('Discard the quiz editor text after saving the reviewed paired deletion?'))
    )
      throw new AdminActionCanceled('The paired change was not saved; the quiz editor draft was kept.');
    busyRef.current = true;
    setBusy('Saving paired draft');
    const version = editVersion.current;
    try {
      const next = await gateway.applyCoordinated(changeSet, flashcards);
      const current = editVersion.current === version;
      invalidateDraft();
      setSnapshot(next);
      if (current) {
        setReason(changeSet.reason);
        setSelection({ kind: 'subject' });
        setEditor('');
        setLoadedEditor('');
      }
      setIssues([]);
      setSummary(
        current
          ? 'Paired draft saved. Saving does not publish.'
          : 'The captured pair was saved. Newer quiz text is kept unsaved.',
      );
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  };

  return {
    discardDialog: confirmation.dialog,
    snapshot,
    selection,
    mode,
    editor,
    recordLoaded: loadedEditor !== '',
    reason,
    issues,
    summary,
    filter,
    setFilter,
    pendingBulk,
    bulkContext,
    bulkTarget,
    busy,
    loadError,
    selectedQuiz,
    selectedSubject,
    editorDirty,
    discardDraft,
    browseContext,
    loadEntity,
    loadNew,
    chooseBulkTarget,
    chooseBulkSubject,
    chooseBulkQuiz,
    showSingle,
    editRecord,
    editReason,
    savePairedChange,
    stageSingle: () => runCommand('Save draft', stageSingle),
    validateBulkDraft: () => runCommand('Validation', validateBulkDraft),
    stageValidatedBulk: () => runCommand('Save draft', stageValidatedBulk),
    stageDelete: (target?: Selection, changeReason?: string, ids?: string[], expectedRevision?: string) =>
      runCommand('Delete', (isCurrent) =>
        stageDelete(isCurrent, target ?? selection, changeReason ?? reason, ids, expectedRevision),
      ),
  };
}
