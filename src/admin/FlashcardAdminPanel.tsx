import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { storedFlashcardBank, serializeFlashcardBank, flashcardContentRevision } from '../content/flashcardBank';
import type {
  StoredFlashcardBank,
  StoredFlashcardDeck,
  StoredFlashcard,
  StoredQuestionBank,
} from '../content/schema';
import { validateFlashcardBank } from '../content/flashcardValidation';
import type { Subject } from '../domain/types';
import { storedQuestionBank } from '../content/questionBank';
import { sha256Text } from '../domain/contentDigest';
import {
  applyFlashcardOperations,
  isFlashcardAdminChangeSet,
  replayFlashcardAdminChangeSet,
  type FlashcardAdminChangeSet,
  type FlashcardAdminOperation,
} from './core/flashcardChangeSet';
import { replayCoordinatedContentChangeSet } from './core/coordinatedContentChangeSet';
import { parseChangeSet } from './core/changeSetSchema';
import { serializeBank } from './core/serializeBank';
import type { AdminChangeSet } from './core/types';

type Kind = 'deck' | 'card';
type Selected = { kind: Kind; id: string } | undefined;
const clone = (bank: StoredFlashcardBank): StoredFlashcardBank => structuredClone(bank);
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const download = (filename: string, contents: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

/** Local-only authoring workspace. It exports reviewed JSON; it never writes canonical files. */
export function FlashcardAdminPanel({
  subjects,
  onBankChange,
  quizRevision,
  originalQuizRevision,
  quizChangesStaged,
  quizBank,
  quizChangeSet,
  onStagePairedImport,
  onResetPaired,
  onPairedExport,
  externalBusy = false,
}: {
  subjects: readonly Subject[];
  onBankChange: (bank: StoredFlashcardBank) => void;
  quizRevision: string;
  originalQuizRevision: string;
  quizChangesStaged: boolean;
  quizBank?: StoredQuestionBank;
  quizChangeSet?: AdminChangeSet;
  onStagePairedImport?: (changeSet: AdminChangeSet, flashcards: StoredFlashcardBank) => Promise<void>;
  onResetPaired?: (flashcards: StoredFlashcardBank) => Promise<void>;
  onPairedExport?: () => void;
  externalBusy?: boolean;
}) {
  const [bank, setBank] = useState(() => clone(storedFlashcardBank));
  const [selection, setSelection] = useState<Selected>();
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local flashcard content edit');
  const [issues, setIssues] = useState<string[]>([]);
  const [history, setHistory] = useState<
    Array<{ bank: StoredFlashcardBank; operations: FlashcardAdminOperation[]; reason: string; dirty: boolean }>
  >([]);
  const [operations, setOperations] = useState<FlashcardAdminOperation[]>([]);
  const [pendingImport, setPendingImport] = useState<{
    changeSet: FlashcardAdminChangeSet;
    bank: StoredFlashcardBank;
    subjectSnapshot: string;
    quizChangeSet?: AdminChangeSet;
    exportContext: string;
  }>();
  const [importFileError, setImportFileError] = useState<string>();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [loadedEditor, setLoadedEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const subjectSnapshot = JSON.stringify(subjects);
  const latestSubjects = useRef(subjectSnapshot);
  latestSubjects.current = subjectSnapshot;
  const exportContext = JSON.stringify([quizRevision, quizChangesStaged, quizChangeSet?.reason]);
  const latestExportContext = useRef(exportContext);
  latestExportContext.current = exportContext;
  const editorDirty = editor !== loadedEditor;
  const warnings = useMemo(
    () => validateFlashcardBank(bank, subjects).filter((issue) => issue.level === 'warning'),
    [bank, subjects],
  );
  useEffect(() => {
    generation.current++;
    setPendingImport(undefined);
    if (operations.length) setDirty(true);
    // Operation edits already mark the workspace dirty; invalidate previews when shared content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectSnapshot, exportContext]);
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (dirty || editorDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', protectDraft);
    return () => removeEventListener('beforeunload', protectDraft);
  }, [dirty, editorDirty]);
  const decksBySubject = useMemo(
    () =>
      bank.decks.reduce<Record<string, StoredFlashcardDeck[]>>(
        (groups, deck) => ((groups[deck.subjectId] ??= []).push(deck), groups),
        {},
      ),
    [bank],
  );
  const cardsByDeck = useMemo(
    () =>
      bank.cards.reduce<Record<string, StoredFlashcard[]>>(
        (groups, card) => ((groups[card.deckId] ??= []).push(card), groups),
        {},
      ),
    [bank],
  );
  const remember = () => {
    setHistory((items) =>
      [...items, { bank: clone(bank), operations: structuredClone(operations), reason, dirty }].slice(-10),
    );
  };
  const discardDraft = () => !editorDirty || window.confirm('Discard the unstaged record edits?');
  const load = (next: Selected, value: unknown) => {
    if (busy || externalBusy) return;
    if (!discardDraft()) return;
    setSelection(next);
    const text = JSON.stringify(value, null, 2);
    setEditor(text);
    setLoadedEditor(text);
    setIssues([]);
  };
  const commitOperation = (operation: FlashcardAdminOperation) => {
    try {
      const candidate = applyFlashcardOperations(bank, subjects, [operation]);
      generation.current++;
      setPendingImport(undefined);
      remember();
      setOperations((items) => [...items, operation]);
      setBank(candidate);
      onBankChange(candidate);
      setDirty(true);
      setIssues([]);
      return candidate;
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Unable to stage this operation.']);
      return undefined;
    }
  };
  const create = (kind: Kind, parentId: string) => {
    if (kind === 'deck') load({ kind, id: '' }, { id: makeId('d'), subjectId: parentId, name: 'New deck' });
    if (kind === 'card')
      load({ kind, id: '' }, { id: makeId('f'), deckId: parentId, front: 'Question', back: 'Answer' });
  };
  const stage = () => {
    if (!selection) return;
    let value: unknown;
    try {
      value = JSON.parse(editor);
    } catch {
      setIssues(['Record JSON is invalid.']);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      setIssues(['Record must be a JSON object.']);
      return;
    }
    const record = value as Record<string, unknown>;
    if (selection.id && record.id !== selection.id) {
      setIssues(['IDs are stable and cannot be changed.']);
      return;
    }
    const op = {
      op: `${selection.kind}.${selection.id ? 'update' : 'create'}`,
      ...(selection.id ? { id: selection.id } : {}),
      value,
    } as FlashcardAdminOperation;
    if (!commitOperation(op)) return;
    const text = JSON.stringify(value, null, 2);
    setSelection({ kind: selection.kind, id: record.id as string });
    setEditor(text);
    setLoadedEditor(text);
  };
  const remove = (kind: Kind, id: string) => {
    if (!discardDraft()) return;
    let operation: FlashcardAdminOperation;
    if (kind === 'deck') {
      const count = bank.cards.filter((card) => card.deckId === id).length;
      if (count && !window.confirm(`Delete this deck and its ${count} card(s)?`)) return;
      operation = { op: 'deck.delete', id, cascade: true };
    } else operation = { op: 'card.delete', id };
    if (!commitOperation(operation)) return;
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const reorder = (direction: -1 | 1) => {
    if (!selection) return;
    const candidate = clone(bank);
    const rows = selection.kind === 'deck' ? candidate.decks : candidate.cards;
    const row = rows.find((item) => item.id === selection.id);
    if (!row) return;
    const parentId = selection.kind === 'deck' && 'subjectId' in row ? row.subjectId : 'deckId' in row ? row.deckId : '';
    const hasSameParent = (item: typeof row) => selection.kind === 'deck'
      ? 'subjectId' in item && item.subjectId === parentId
      : 'deckId' in item && item.deckId === parentId;
    const siblings = rows.map((item, index) => ({ item, index })).filter(({ item }) => hasSameParent(item));
    const siblingPosition = siblings.findIndex(({ item }) => item.id === selection.id);
    const target = siblings[siblingPosition + direction];
    if (!target) return;
    const afterPosition = direction === -1 ? siblingPosition - 2 : siblingPosition + 1;
    const afterId = siblings[afterPosition]?.item.id;
    commitOperation({
      op: `${selection.kind}.move`,
      id: selection.id,
      ...(afterId ? { afterId } : { first: true }),
    } as FlashcardAdminOperation);
  };
  const undo = () => {
    if (!discardDraft()) return;
    const previous = history.at(-1);
    if (!previous) return;
    const errors = validateFlashcardBank(previous.bank, subjects).filter((issue) => issue.level === 'error');
    if (errors.length) {
      setIssues(errors.map((issue) => issue.message));
      return;
    }
    generation.current++;
    setPendingImport(undefined);
    setBank(previous.bank);
    onBankChange(previous.bank);
    setHistory((items) => items.slice(0, -1));
    setOperations(previous.operations);
    setReason(previous.reason);
    setDirty(previous.dirty);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
    setIssues([]);
  };
  const clearWorkspace = (initial: StoredFlashcardBank) => {
    generation.current++;
    setPendingImport(undefined);
    setImportFileError(undefined);
    setBank(initial);
    onBankChange(initial);
    setHistory([]);
    setOperations([]);
    setDirty(false);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
    setIssues([]);
  };
  const reset = () => {
    if ((dirty || editorDirty) && !window.confirm('Discard every staged and unstaged flashcard change?')) return;
    const initial = clone(storedFlashcardBank);
    const errors = validateFlashcardBank(initial, subjects).filter((issue) => issue.level === 'error');
    if (errors.length) {
      setIssues(errors.map((issue) => issue.message));
      return;
    }
    clearWorkspace(initial);
  };
  const resetBoth = async () => {
    if (
      !onResetPaired ||
      !window.confirm('Discard all staged changes and editor drafts in BOTH Quizzes and Flashcards?')
    )
      return;
    setBusy(true);
    try {
      const initial = clone(storedFlashcardBank);
      await onResetPaired(initial);
      clearWorkspace(initial);
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Unable to reset both content banks.']);
    } finally {
      setBusy(false);
    }
  };
  const exportFiles = async () => {
    if (editorDirty) {
      setIssues(['Stage or discard the record edits before exporting.']);
      return;
    }
    if (!reason.trim()) {
      setIssues(['A change reason is required before export.']);
      return;
    }
    const token = generation.current;
    const exportedSubjects = subjectSnapshot;
    setBusy(true);
    try {
      const baseRevision = await flashcardContentRevision(storedFlashcardBank);
      const nextRevision = await flashcardContentRevision(bank, [...subjects]);
      const baseSubjectRevision = await sha256Text(JSON.stringify(storedQuestionBank.subjects));
      const resultSubjectRevision = await sha256Text(JSON.stringify(subjects));
      const replayed = applyFlashcardOperations(storedFlashcardBank, [...subjects], operations);
      if (serializeFlashcardBank(replayed) !== serializeFlashcardBank(bank)) {
        setIssues([
          'The staged operation list does not reproduce the current flashcard bank. Reset and restage the affected records.',
        ]);
        return;
      }
      const changeSet = {
        changeSetVersion: 2,
        base: { schemaVersion: 2, revision: baseRevision, subjectRevision: baseSubjectRevision },
        resultRevision: nextRevision,
        resultSubjectRevision,
        reason,
        operations,
      };
      if (!isFlashcardAdminChangeSet(changeSet)) {
        setIssues(['The staged change set is invalid. Review staged records before exporting.']);
        return;
      }
      if (quizChangesStaged && (!quizBank || !quizChangeSet || !parseChangeSet(quizChangeSet).changeSet)) {
        setIssues(['A valid matching quiz change set is required for coordinated export.']);
        return;
      }
      if (
        token !== generation.current ||
        exportedSubjects !== latestSubjects.current ||
        exportContext !== latestExportContext.current
      ) {
        setIssues(['The workspace changed during export. Export the current snapshot again.']);
        return;
      }
      download('flashcardBank.generated.json', serializeFlashcardBank(bank));
      download('flashcard-bank-change-set.json', `${JSON.stringify(changeSet, null, 2)}\n`);
      if (quizChangesStaged && quizBank && quizChangeSet) {
        download('questionBank.generated.json', serializeBank(quizBank));
        download('question-bank-change-set.json', `${JSON.stringify(quizChangeSet, null, 2)}\n`);
        download(
          'content-change-set-bundle.json',
          `${JSON.stringify({ bundleVersion: 1, quizzes: quizChangeSet, flashcards: changeSet }, null, 2)}\n`,
        );
        download(
          'content-export-manifest.json',
          `${JSON.stringify({ manifestVersion: 1, coordinated: true, files: ['questionBank.generated.json', 'flashcardBank.generated.json'], quizBank: { baseRevision: originalQuizRevision, resultRevision: quizRevision }, flashcards: { resultRevision: nextRevision }, replaceTogether: true }, null, 2)}\n`,
        );
        onPairedExport?.();
      }
      setDirty(false);
      setIssues([]);
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Unable to export the flashcard content.']);
    } finally {
      setBusy(false);
    }
  };
  const previewImport = async (file?: File) => {
    setPendingImport(undefined);
    setImportFileError(undefined);
    if (!file) return;
    if (operations.length || editorDirty) {
      setImportFileError('Reset or undo the current workspace before importing another change set.');
      return;
    }
    const token = ++generation.current;
    const importedSubjects = subjectSnapshot;
    setBusy(true);
    try {
      const input: unknown = JSON.parse(await file.text());
      if (input && typeof input === 'object' && 'bundleVersion' in input) {
        if (!quizBank || !onStagePairedImport)
          throw new Error('Coordinated imports require the full local authoring workspace.');
        if (quizChangesStaged)
          throw new Error('Reset or undo staged quiz changes before importing a coordinated bundle.');
        const paired = await replayCoordinatedContentChangeSet(quizBank, storedFlashcardBank, input);
        if (
          token !== generation.current ||
          importedSubjects !== latestSubjects.current ||
          exportContext !== latestExportContext.current
        )
          throw new Error('The workspace changed during import. Preview the file again.');
        setPendingImport({
          changeSet: paired.flashcardChangeSet,
          bank: paired.flashcards,
          subjectSnapshot: importedSubjects,
          quizChangeSet: paired.quizChangeSet,
          exportContext,
        });
        return;
      }
      if (!isFlashcardAdminChangeSet(input)) throw new Error('The file is not a valid flashcard change set.');
      const next = await replayFlashcardAdminChangeSet(
        storedFlashcardBank,
        storedQuestionBank.subjects,
        input,
        subjects,
      );
      if (token !== generation.current || importedSubjects !== latestSubjects.current)
        throw new Error('The workspace changed during import. Preview the file again.');
      setPendingImport({ changeSet: input, bank: next, subjectSnapshot: importedSubjects, exportContext });
    } catch (error) {
      setImportFileError(error instanceof Error ? error.message : 'Unable to preview this flashcard change set.');
    } finally {
      setBusy(false);
    }
  };
  const stageImport = async () => {
    if (!pendingImport) return;
    if (
      pendingImport.subjectSnapshot !== subjectSnapshot ||
      pendingImport.exportContext !== exportContext ||
      operations.length ||
      editorDirty
    ) {
      setPendingImport(undefined);
      setImportFileError('The workspace changed after preview. Preview the file again.');
      return;
    }
    setBusy(true);
    try {
      if (pendingImport.quizChangeSet) {
        if (!onStagePairedImport) throw new Error('Coordinated import is unavailable.');
        await onStagePairedImport(pendingImport.quizChangeSet, pendingImport.bank);
      }
      generation.current++;
      remember();
      setBank(pendingImport.bank);
      onBankChange(pendingImport.bank);
      setOperations(pendingImport.changeSet.operations);
      setReason(pendingImport.changeSet.reason);
      setDirty(true);
      setSelection(undefined);
      setEditor('');
      setLoadedEditor('');
      setPendingImport(undefined);
    } catch (error) {
      setImportFileError(error instanceof Error ? error.message : 'Unable to stage the coordinated import.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack
      component="fieldset"
      disabled={busy || externalBusy}
      sx={{ border: 0, p: 0, m: 0 }}
      direction={{ xs: 'column', lg: 'row' }}
      spacing={2}
      alignItems="stretch"
    >
      <Paper variant="outlined" sx={{ width: { lg: 340 }, p: 2, maxHeight: { lg: '78vh' }, overflow: 'auto' }}>
        <Stack spacing={1}>
          <Typography variant="h6">Flashcard content</Typography>
          <Typography variant="caption" color="text.secondary">
            Subjects come from the quiz subject catalog.
          </Typography>
          <List component="nav" aria-label="Flashcard content navigator" dense>
            {subjects.map((subject) => (
              <Box key={subject.id}>
                <ListItemText primary={subject.name} secondary={subject.id} />
                <Button size="small" onClick={() => create('deck', subject.id)}>
                  Add deck
                </Button>
                {decksBySubject[subject.id]?.map((deck) => (
                      <Box key={deck.id} sx={{ pl: 2 }}>
                        <ListItemButton
                          selected={selection?.kind === 'deck' && selection.id === deck.id}
                          onClick={() => load({ kind: 'deck', id: deck.id }, deck)}
                        >
                          <ListItemText primary={deck.name} secondary={`${cardsByDeck[deck.id]?.length ?? 0} cards`} />
                        </ListItemButton>
                        <Button size="small" onClick={() => create('card', deck.id)}>
                          Add card
                        </Button>
                        {cardsByDeck[deck.id]?.map((card) => (
                          <ListItemButton
                            key={card.id}
                            sx={{ pl: 4 }}
                            selected={selection?.kind === 'card' && selection.id === card.id}
                            onClick={() => load({ kind: 'card', id: card.id }, card)}
                          >
                            <ListItemText primary={card.front.slice(0, 50)} secondary="Card" />
                          </ListItemButton>
                        ))}
                      </Box>
                ))}
              </Box>
            ))}
          </List>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {selection ? `${selection.id ? 'Edit' : 'Create'} ${selection.kind}` : 'Select a deck or card'}
          </Typography>
          <TextField
            label="Reason"
            value={reason}
            onChange={(event) => {
              generation.current++;
              setReason(event.target.value);
              if (operations.length) setDirty(true);
            }}
            required
          />
          <TextField
            label="Record JSON"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            multiline
            minRows={14}
            fullWidth
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
          />
          {issues.length > 0 && (
            <Alert severity="error">
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          )}
          {warnings.length > 0 && (
            <Alert severity="warning">
              {warnings.map((issue, index) => (
                <Box key={index}>{issue.message}</Box>
              ))}
            </Alert>
          )}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant="contained" disabled={!selection} onClick={stage}>
              Stage record
            </Button>
            <Button
              color="error"
              disabled={!selection?.id}
              onClick={() => selection && remove(selection.kind, selection.id)}
            >
              Delete
            </Button>
            <Button disabled={!selection?.id} onClick={() => reorder(-1)}>
              Move up
            </Button>
            <Button disabled={!selection?.id} onClick={() => reorder(1)}>
              Move down
            </Button>
            <Divider flexItem orientation="vertical" />
            <Button disabled={!history.length} onClick={undo}>
              Undo
            </Button>
            <Button disabled={!operations.length && !editorDirty} onClick={reset}>
              Reset
            </Button>
            {onResetPaired && quizChangesStaged && <Button onClick={() => void resetBoth()}>Reset both banks</Button>}
            <Button variant="outlined" color="success" disabled={!dirty} onClick={() => void exportFiles()}>
              Export flashcard JSON and change set
            </Button>
            <Button onClick={() => importFileRef.current?.click()} disabled={Boolean(operations.length) || editorDirty}>
              Import change set
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void previewImport(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </Stack>
          {pendingImport && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle1">Import preview</Typography>
                <Typography variant="body2" color="text.secondary">
                  {pendingImport.changeSet.operations.length} operation(s) · {pendingImport.changeSet.reason}
                </Typography>
                {pendingImport.quizChangeSet && (
                  <TextField
                    label="Paired quiz change set"
                    value={JSON.stringify(pendingImport.quizChangeSet, null, 2)}
                    multiline
                    minRows={6}
                    fullWidth
                    InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
                  />
                )}
                <TextField
                  label="Resulting flashcard bank"
                  value={serializeFlashcardBank(pendingImport.bank)}
                  multiline
                  minRows={8}
                  fullWidth
                  InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={stageImport}>
                    Stage import
                  </Button>
                  <Button onClick={() => setPendingImport(undefined)}>Cancel</Button>
                </Stack>
              </Stack>
            </Paper>
          )}
          {importFileError && <Alert severity="error">{importFileError}</Alert>}
          {dirty && (
            <Alert severity="info">
              Changes are staged in this browser session. Export the JSON and change set, review them, then replace the
              canonical file.
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
