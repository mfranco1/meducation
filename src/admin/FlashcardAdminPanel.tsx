import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  Divider,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { storedFlashcardBank, serializeFlashcardBank, flashcardContentRevision } from '../content/local/flashcardBank';
import type {
  StoredFlashcardBank,
  StoredFlashcardDeck,
  StoredFlashcard,
  StoredQuestionBank,
} from '../content/schema/schema';
import { validateFlashcardBank } from '../content/validation/flashcardValidation';
import type { Subject } from '../domain/types';
import { storedQuestionBank } from '../content/local/questionBank';
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
import { FlashcardBulkAddDialog, type FlashcardBulkPreviewSnapshot } from './FlashcardBulkAddDialog';
import type { FlashcardBulkAddContext } from './core/flashcardBulkAddDraft';
import { downloadJson } from './downloadJson';
import { selectFlashcardPage } from './core/flashcardNavigator';

type Kind = 'deck' | 'card';
type Selected = { kind: Kind; id: string } | undefined;
const clone = (bank: StoredFlashcardBank): StoredFlashcardBank => structuredClone(bank);
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

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
  const [browseSubjectId, setBrowseSubjectId] = useState('');
  const [browseDeckId, setBrowseDeckId] = useState('');
  const [cardQuery, setCardQuery] = useState('');
  const [cardPage, setCardPage] = useState(0);
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local flashcard content edit');
  const [issues, setIssues] = useState<string[]>([]);
  const [history, setHistory] = useState<
    Array<{
      bank: StoredFlashcardBank;
      operations: FlashcardAdminOperation[];
      reason: string;
      dirty: boolean;
      browseSubjectId: string;
      browseDeckId: string;
      cardQuery: string;
      cardPage: number;
    }>
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
  const [bulkDraftDirty, setBulkDraftDirty] = useState(false);
  const [bulkDestination, setBulkDestination] = useState<{
    context: FlashcardBulkAddContext;
    label: string;
  }>();
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
    if (browseSubjectId && !subjects.some((subject) => subject.id === browseSubjectId)) {
      setBrowseSubjectId('');
      setBrowseDeckId('');
      setCardQuery('');
      setCardPage(0);
    } else if (browseDeckId && !bank.decks.some((deck) => deck.id === browseDeckId)) {
      setBrowseDeckId('');
      setCardQuery('');
      setCardPage(0);
    }
  }, [bank.decks, browseDeckId, browseSubjectId, subjects]);
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (dirty || editorDirty || bulkDraftDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', protectDraft);
    return () => removeEventListener('beforeunload', protectDraft);
  }, [dirty, editorDirty, bulkDraftDirty]);
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
  const browseDecks = decksBySubject[browseSubjectId] ?? [];
  const browseDeck = browseDecks.find((deck) => deck.id === browseDeckId);
  const deckCards = browseDeck ? (cardsByDeck[browseDeck.id] ?? []) : [];
  const cardResults = selectFlashcardPage(deckCards, cardQuery, cardPage);
  const remember = () => {
    setHistory((items) =>
      [
        ...items,
        {
          bank: clone(bank),
          operations: structuredClone(operations),
          reason,
          dirty,
          browseSubjectId,
          browseDeckId,
          cardQuery,
          cardPage,
        },
      ].slice(-10),
    );
  };
  const discardDraft = () => !editorDirty || window.confirm('Discard the unstaged record edits?');
  const changeBrowseSubject = (subjectId: string) => {
    if (subjectId === browseSubjectId || busy || externalBusy || !discardDraft()) return;
    setBrowseSubjectId(subjectId);
    setBrowseDeckId('');
    setCardQuery('');
    setCardPage(0);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const changeBrowseDeck = (deckId: string) => {
    if (deckId === browseDeckId || busy || externalBusy || !discardDraft()) return;
    setBrowseDeckId(deckId);
    setCardQuery('');
    setCardPage(0);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const load = (next: Selected, value: unknown) => {
    if (busy || externalBusy) return;
    if (next?.id && next.kind === selection?.kind && next.id === selection.id) return;
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
      if (!candidate.decks.some((deck) => deck.id === browseDeckId)) {
        setBrowseDeckId('');
        setCardQuery('');
        setCardPage(0);
      }
      if (!subjects.some((subject) => subject.id === browseSubjectId)) {
        setBrowseSubjectId('');
        setBrowseDeckId('');
      }
      setDirty(true);
      setIssues([]);
      return candidate;
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Unable to stage this operation.']);
      return undefined;
    }
  };
  const commitBulkOperations = (
    batch: readonly FlashcardAdminOperation[],
    snapshot: FlashcardBulkPreviewSnapshot,
  ): string | undefined => {
    if (!bulkDestination) return 'The bulk destination is no longer selected. Open the batch again.';
    if (
      snapshot.bankJson !== serializeFlashcardBank(bank) ||
      snapshot.subjectSnapshot !== subjectSnapshot ||
      snapshot.destination !== JSON.stringify(bulkDestination.context) ||
      snapshot.reason !== reason ||
      snapshot.exportContext !== exportContext
    )
      return 'The workspace changed after preview. Preview the batch again.';
    try {
      const candidate = applyFlashcardOperations(bank, subjects, batch);
      generation.current++;
      setPendingImport(undefined);
      remember();
      setOperations((items) => [...items, ...structuredClone(batch)]);
      setBank(candidate);
      onBankChange(candidate);
      setDirty(true);
      setIssues([]);
      setSelection(undefined);
      setEditor('');
      setLoadedEditor('');
      setBulkDestination(undefined);
      setBulkDraftDirty(false);
      const first = batch.find((operation) => operation.op === 'card.create' || operation.op === 'deck.create');
      if (first?.op === 'card.create') {
        const deck = candidate.decks.find((item) => item.id === first.value.deckId);
        if (deck) setBrowseSubjectId(deck.subjectId);
        setBrowseDeckId(first.value.deckId);
        setCardQuery('');
        const position = candidate.cards
          .filter((card) => card.deckId === first.value.deckId)
          .findIndex((card) => card.id === first.value.id);
        setCardPage(Math.max(0, Math.floor(position / 25)));
      } else if (first?.op === 'deck.create') {
        setBrowseSubjectId(first.value.subjectId);
        setBrowseDeckId(first.value.id);
        setCardQuery('');
        setCardPage(0);
      }
    } catch (error) {
      return error instanceof Error ? error.message : 'Unable to stage the bulk flashcard batch.';
    }
    return undefined;
  };
  const openBulk = (context: FlashcardBulkAddContext, label: string) => {
    if (busy || externalBusy || !discardDraft()) return;
    if (editorDirty) {
      setSelection(undefined);
      setEditor('');
      setLoadedEditor('');
    }
    setBulkDraftDirty(false);
    setBulkDestination({ context, label });
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
    const candidate = commitOperation(op);
    if (!candidate) return;
    const text = JSON.stringify(value, null, 2);
    setSelection({ kind: selection.kind, id: record.id as string });
    setEditor(text);
    setLoadedEditor(text);
    if (selection.kind === 'deck') {
      setBrowseSubjectId(record.subjectId as string);
      setBrowseDeckId(record.id as string);
      setCardQuery('');
      setCardPage(0);
    } else {
      const deckId = record.deckId as string;
      const deck = bank.decks.find((item) => item.id === deckId);
      if (deck) setBrowseSubjectId(deck.subjectId);
      setBrowseDeckId(deckId);
      setCardQuery('');
      const position = candidate.cards
        .filter((item) => item.deckId === deckId)
        .findIndex((item) => item.id === record.id);
      setCardPage(Math.max(0, Math.floor(position / 25)));
    }
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
    const parentId =
      selection.kind === 'deck' && 'subjectId' in row ? row.subjectId : 'deckId' in row ? row.deckId : '';
    const hasSameParent = (item: typeof row) =>
      selection.kind === 'deck'
        ? 'subjectId' in item && item.subjectId === parentId
        : 'deckId' in item && item.deckId === parentId;
    const siblings = rows.map((item, index) => ({ item, index })).filter(({ item }) => hasSameParent(item));
    const siblingPosition = siblings.findIndex(({ item }) => item.id === selection.id);
    const target = siblings[siblingPosition + direction];
    if (!target) return;
    const afterPosition = direction === -1 ? siblingPosition - 2 : siblingPosition + 1;
    const afterId = siblings[afterPosition]?.item.id;
    const resultBank = commitOperation({
      op: `${selection.kind}.move`,
      id: selection.id,
      ...(afterId ? { afterId } : { first: true }),
    } as FlashcardAdminOperation);
    if (resultBank && selection.kind === 'card') {
      const card = resultBank.cards.find((item) => item.id === selection.id);
      if (!card) return;
      const visible = selectFlashcardPage(
        resultBank.cards.filter((item) => item.deckId === card.deckId),
        cardQuery,
        0,
      ).matches;
      const position = visible.findIndex(({ card: item }) => item.id === card.id);
      if (position >= 0) setCardPage(Math.floor(position / 25));
    }
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
    const restoredSubject = subjects.some((subject) => subject.id === previous.browseSubjectId)
      ? previous.browseSubjectId
      : '';
    const restoredDeck = previous.bank.decks.some((deck) => deck.id === previous.browseDeckId)
      ? previous.browseDeckId
      : '';
    setBrowseSubjectId(restoredSubject);
    setBrowseDeckId(restoredDeck);
    setCardQuery(restoredDeck ? previous.cardQuery : '');
    setCardPage(restoredDeck ? previous.cardPage : 0);
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
    setBrowseSubjectId('');
    setBrowseDeckId('');
    setCardQuery('');
    setCardPage(0);
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
      downloadJson('flashcardBank.generated.json', serializeFlashcardBank(bank));
      downloadJson('flashcard-bank-change-set.json', `${JSON.stringify(changeSet, null, 2)}\n`);
      if (quizChangesStaged && quizBank && quizChangeSet) {
        downloadJson('questionBank.generated.json', serializeBank(quizBank));
        downloadJson('question-bank-change-set.json', `${JSON.stringify(quizChangeSet, null, 2)}\n`);
        downloadJson(
          'content-change-set-bundle.json',
          `${JSON.stringify({ bundleVersion: 1, quizzes: quizChangeSet, flashcards: changeSet }, null, 2)}\n`,
        );
        downloadJson(
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
      setBrowseSubjectId('');
      setBrowseDeckId('');
      setCardQuery('');
      setCardPage(0);
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
      <Paper
        variant="outlined"
        sx={{
          width: { lg: 340 },
          p: 2,
          maxHeight: { xs: '40dvh', lg: '78vh' },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Stack spacing={1} sx={{ minHeight: 0, flex: 1 }}>
          <Autocomplete
            options={[...subjects]}
            value={subjects.find((subject) => subject.id === browseSubjectId) ?? null}
            getOptionLabel={(subject) => subject.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, subject) => changeBrowseSubject(subject?.id ?? '')}
            renderInput={(params) => <TextField {...params} label="Subject" size="small" />}
          />
          {browseSubjectId && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              <Button size="small" onClick={() => create('deck', browseSubjectId)}>
                Add deck
              </Button>
              <Button
                size="small"
                onClick={() =>
                  openBulk(
                    { kind: 'subject', subjectId: browseSubjectId },
                    subjects.find((subject) => subject.id === browseSubjectId)?.name ?? '',
                  )
                }
              >
                Bulk add decks
              </Button>
            </Stack>
          )}
          {browseSubjectId && (
            <Autocomplete
              options={browseDecks}
              value={browseDeck ?? null}
              getOptionLabel={(deck) => `${deck.name} · ${cardsByDeck[deck.id]?.length ?? 0} cards`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, deck) => changeBrowseDeck(deck?.id ?? '')}
              renderInput={(params) => <TextField {...params} label="Deck" size="small" />}
            />
          )}
          {browseSubjectId && !browseDecks.length && <Typography variant="body2">No decks in this subject.</Typography>}
          {browseDeckId && browseDecks.some((deck) => deck.id === browseDeckId) && (
            <>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Button
                  size="small"
                  onClick={() =>
                    load(
                      { kind: 'deck', id: browseDeckId },
                      browseDecks.find((deck) => deck.id === browseDeckId),
                    )
                  }
                >
                  Edit deck
                </Button>
                <Button size="small" onClick={() => create('card', browseDeckId)}>
                  Add card
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    openBulk(
                      { kind: 'deck', deckId: browseDeckId },
                      `${subjects.find((subject) => subject.id === browseSubjectId)?.name ?? ''} / ${browseDecks.find((deck) => deck.id === browseDeckId)?.name ?? ''}`,
                    )
                  }
                >
                  Bulk add cards
                </Button>
              </Stack>
              <TextField
                label="Search cards in this deck"
                value={cardQuery}
                size="small"
                onChange={(event) => {
                  setCardQuery(event.target.value);
                  setCardPage(0);
                }}
              />
              <Typography variant="caption" aria-live="polite">
                {cardQuery
                  ? `${cardResults.matches.length} matches of ${deckCards.length} cards`
                  : `${deckCards.length} cards`}
              </Typography>
              {selection?.kind === 'card' &&
                selection.id &&
                bank.cards.some((card) => card.id === selection.id) &&
                !cardResults.visible.some(({ card }) => card.id === selection.id) && (
                  <Button
                    size="small"
                    onClick={() => {
                      const card = bank.cards.find((item) => item.id === selection.id);
                      if (!card) return;
                      const parent = bank.decks.find((deck) => deck.id === card.deckId);
                      if (parent) setBrowseSubjectId(parent.subjectId);
                      setBrowseDeckId(card.deckId);
                      setCardQuery('');
                      const position = bank.cards
                        .filter((item) => item.deckId === card.deckId)
                        .findIndex((item) => item.id === card.id);
                      setCardPage(Math.max(0, Math.floor(position / 25)));
                    }}
                  >
                    Show in list
                  </Button>
                )}
              <Box
                component="nav"
                aria-label="Flashcards in selected deck"
                sx={{ overflowY: 'auto', minHeight: 0, flex: 1, maxHeight: { lg: '42vh' } }}
              >
                {cardResults.visible.map(({ card, position }) => (
                  <ListItemButton
                    key={card.id}
                    selected={selection?.kind === 'card' && selection.id === card.id}
                    onClick={() => load({ kind: 'card', id: card.id }, card)}
                    sx={{ borderRadius: '10px', mx: 0.5, width: 'calc(100% - 8px)' }}
                  >
                    <ListItemText
                      primary={`${position}. ${card.front}`}
                      secondary={card.id}
                      primaryTypographyProps={{
                        sx: {
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        },
                      }}
                    />
                  </ListItemButton>
                ))}
                {!deckCards.length && (
                  <Typography sx={{ p: 1 }} variant="body2">
                    No cards in this deck.
                  </Typography>
                )}
                {deckCards.length > 0 && !cardResults.matches.length && (
                  <Stack spacing={1} sx={{ p: 1 }}>
                    <Typography variant="body2">No matching cards.</Typography>
                    <Button
                      size="small"
                      onClick={() => {
                        setCardQuery('');
                        setCardPage(0);
                      }}
                    >
                      Clear search
                    </Button>
                  </Stack>
                )}
              </Box>
              {cardResults.matches.length > 0 && (
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="caption">
                    {cardResults.rangeStart}–{cardResults.rangeEnd} of {cardResults.matches.length}
                    {cardQuery ? ` matches · ${deckCards.length} total` : ' cards'}
                  </Typography>
                  {cardResults.pageCount > 1 && (
                    <Stack direction="row">
                      <Button
                        size="small"
                        aria-label="Previous card page"
                        disabled={!cardResults.page}
                        onClick={() => setCardPage((page) => Math.max(0, page - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="small"
                        aria-label="Next card page"
                        disabled={cardResults.page + 1 >= cardResults.pageCount}
                        onClick={() => setCardPage((page) => Math.min(cardResults.pageCount - 1, page + 1))}
                      >
                        Next
                      </Button>
                    </Stack>
                  )}
                </Stack>
              )}
            </>
          )}
          {!browseSubjectId && <Typography variant="body2">Choose a subject to begin.</Typography>}
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
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
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
            <Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
            <Button disabled={!history.length} onClick={undo}>
              Undo
            </Button>
            <Button disabled={!operations.length && !editorDirty} onClick={reset}>
              Reset
            </Button>
            {onResetPaired && quizChangesStaged && <Button onClick={() => void resetBoth()}>Reset both banks</Button>}
            <Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
            <Button variant="outlined" disabled={!dirty} onClick={() => void exportFiles()}>
              Export flashcards
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
          {(dirty || quizChangesStaged) && (
            <Box role="status" sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
              <Typography variant="body2" fontWeight={700}>
                {dirty && quizChangesStaged
                  ? 'Quiz and flashcard changes · not exported'
                  : dirty
                    ? 'Flashcard changes · not exported'
                    : 'Quiz changes staged'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dirty && quizChangesStaged
                  ? 'Export downloads both banks and their change sets with a replacement manifest and content bundle.'
                  : dirty
                    ? 'Export the flashcard bank and change set, review both files, then replace the canonical file.'
                    : 'Export downloads both banks and their change sets with a replacement manifest and content bundle.'}
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>
      {bulkDestination && (
        <FlashcardBulkAddDialog
          open
          context={bulkDestination.context}
          destinationLabel={bulkDestination.label}
          bank={bank}
          subjects={subjects}
          reason={reason}
          onReasonChange={(value) => {
            generation.current++;
            setReason(value);
            if (operations.length) setDirty(true);
          }}
          exportContext={exportContext}
          busy={busy || externalBusy}
          onClose={() => setBulkDestination(undefined)}
          onDraftDirtyChange={setBulkDraftDirty}
          onStage={commitBulkOperations}
        />
      )}
    </Stack>
  );
}
