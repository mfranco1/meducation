import { adoptReservedDraftId } from './core/recordDraft';
import { AdminActionCanceled } from './core/AdminActionCanceled';
import { AdminRecordEditor } from './components/AdminRecordEditor';
import { AdminParentActions } from './components/AdminParentActions';
import { AdminEditorFrame, AdminEditorEmpty, AdminEditorActions } from './components/AdminEditorFrame';
import { useAdminConfirmation } from './useAdminConfirmation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Checkbox,
  Alert,
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { serializeFlashcardBank } from './core/flashcardSerialization';
import type {
  StoredFlashcardBank,
  StoredFlashcardDeck,
  StoredFlashcard,
  StoredQuestionBank,
} from '../content/schema/schema';
import { validateFlashcardBank } from '../content/validation/flashcardValidation';
import type { Subject } from '../domain/types';
import { applyFlashcardOperations, type FlashcardAdminOperation } from './core/flashcardChangeSet';
import { FlashcardBulkAddDialog, type FlashcardBulkPreviewSnapshot } from './FlashcardBulkAddDialog';
import type { FlashcardBulkAddContext } from './core/flashcardBulkAddDraft';
import { selectFlashcardPage } from './core/flashcardNavigator';
import { adminNavigatorLayout } from './components/adminPanelLayout';
import { AdminRecordSelection, useAdminRecordSelection } from './components/AdminRecordSelection';
import { AdminIssues } from './components/AdminIssues';
import { AdminDeleteDialog, type DeleteRequest } from './components/AdminDeleteDialog';

type Kind = 'deck' | 'card';
type Selected = { kind: Kind; id: string } | undefined;
const clone = (bank: StoredFlashcardBank): StoredFlashcardBank => structuredClone(bank);

/** Edits a server snapshot; only a successful HTTP receipt installs a saved bank. */
export function FlashcardAdminPanel({
  subjects,
  serverBank: bank,
  onSaveBank,
  recovery,
  quizRevision,
  quizBank,
  onDeleteSubject,
  onAddSubject,
  onEditSubject,
  onManageSubjects,
  onDraftChange,
  onEdit,
  discardRequest = 0,
  externalBusy = false,
}: {
  subjects: readonly Subject[];
  serverBank: StoredFlashcardBank;
  onSaveBank: (bank: StoredFlashcardBank, reason: string) => Promise<StoredFlashcardBank>;
  quizRevision: string;
  quizBank: StoredQuestionBank;
  onDeleteSubject: (subjectId: string, subjectName: string) => void;
  onAddSubject: () => void;
  onManageSubjects: (id?: string) => void;
  onEditSubject: (subjectId: string, subjectName: string) => void;
  onDraftChange?: (dirty: boolean) => void;
  onEdit?: () => void;
  discardRequest?: number;
  externalBusy?: boolean;
  recovery?: ReactNode;
}) {
  const [selection, setSelection] = useState<Selected>();
  const [browseSubjectId, setBrowseSubjectId] = useState('');
  const [browseDeckId, setBrowseDeckId] = useState('');
  const [subjectQuery, setSubjectQuery] = useState<string>();
  const [deckQuery, setDeckQuery] = useState<string>();
  const [cardQuery, setCardQuery] = useState('');
  const [cardPage, setCardPage] = useState(0);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>();
  const [deleteError, setDeleteError] = useState('');
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [editor, setEditor] = useState('');
  const editVersion = useRef(0);
  const [reason, setReason] = useState('Flashcard content edit');
  const [notice, setNotice] = useState('');
  const lastSaveCanceled = useRef(false);
  const [issues, setIssues] = useState<string[]>([]);
  const bulkEditVersion = useRef(0);
  const [bulkDraftDirty, setBulkDraftDirty] = useState(false);
  const [bulkDestination, setBulkDestination] = useState<{
    context: FlashcardBulkAddContext;
    label: string;
  }>();
  const [loadedEditor, setLoadedEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const subjectSnapshot = JSON.stringify(subjects);
  const exportContext = quizRevision;
  const editorDirty = editor !== loadedEditor;
  const warnings = useMemo(
    () => validateFlashcardBank(bank, subjects).filter((issue) => issue.level === 'warning'),
    [bank, subjects],
  );
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
      if (editorDirty || bulkDraftDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', protectDraft);
    return () => removeEventListener('beforeunload', protectDraft);
  }, [editorDirty, bulkDraftDirty]);
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
  const recordSelection = useAdminRecordSelection(
    JSON.stringify([browseSubjectId, browseDeckId, cardQuery]),
    deckCards.map((row) => row.id),
  );
  useEffect(() => {
    onDraftChange?.(editorDirty || bulkDraftDirty);
  }, [editorDirty, bulkDraftDirty, onDraftChange]);
  useEffect(() => {
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
    setBulkDestination(undefined);
    setBulkDraftDirty(false);
  }, [discardRequest]);
  const confirmation = useAdminConfirmation([editor, reason, bank, subjects, busy, externalBusy]);
  const discardDraft = () => confirmation.request('Discard the unsaved flashcard editor text to continue?');
  const changeBrowseSubject = async (subjectId: string) => {
    if (subjectId === browseSubjectId || busy || externalBusy || (editorDirty && !(await discardDraft()))) return;
    setBrowseSubjectId(subjectId);
    setBrowseDeckId('');
    setCardQuery('');
    setCardPage(0);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const changeBrowseDeck = async (deckId: string) => {
    if (deckId === browseDeckId || busy || externalBusy || (editorDirty && !(await discardDraft()))) return;
    setBrowseDeckId(deckId);
    setCardQuery('');
    setCardPage(0);
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const load = async (next: Selected, value: unknown) => {
    if (busy || externalBusy) return;
    if (next?.id && next.kind === selection?.kind && next.id === selection.id) return;
    if (editorDirty && !(await discardDraft())) return;
    setSelection(next);
    const text = JSON.stringify(value, null, 2);
    setEditor(text);
    setLoadedEditor(text);
    setIssues([]);
  };
  const commitOperations = (batch: FlashcardAdminOperation[]) => {
    if (busy || externalBusy) return;
    if (!reason.trim()) {
      setIssues(['Enter a change reason before saving.']);
      return;
    }
    lastSaveCanceled.current = false;
    setNotice('');
    try {
      const candidate = applyFlashcardOperations(bank, subjects, batch);
      setBusy(true);
      return onSaveBank(candidate, reason)
        .then(install)
        .catch((error) => {
          if (error instanceof AdminActionCanceled) {
            lastSaveCanceled.current = true;
            setIssues([]);
            setNotice(error.message);
            return undefined;
          }
          setIssues([error instanceof Error ? error.message : 'Unable to save. Unsaved text is kept.']);
          return undefined;
        })
        .finally(() => setBusy(false));
    } catch (error) {
      setIssues([error instanceof Error ? error.message : 'Unable to save this operation.']);
      return undefined;
    }
    function install(candidate: StoredFlashcardBank) {
      if (!candidate.decks.some((deck) => deck.id === browseDeckId)) {
        setBrowseDeckId('');
        setCardQuery('');
        setCardPage(0);
      }
      if (!subjects.some((subject) => subject.id === browseSubjectId)) {
        setBrowseSubjectId('');
        setBrowseDeckId('');
      }
      setIssues([]);
      return candidate;
    }
  };
  const commitOperation = (operation: FlashcardAdminOperation) => commitOperations([operation]);
  const commitBulkOperations = async (
    batch: readonly FlashcardAdminOperation[],
    snapshot: FlashcardBulkPreviewSnapshot,
  ): Promise<string | undefined> => {
    if (!bulkDestination) return 'The bulk destination is no longer selected. Open the batch again.';
    if (
      snapshot.bankJson !== serializeFlashcardBank(bank) ||
      snapshot.subjectSnapshot !== subjectSnapshot ||
      snapshot.destination !== JSON.stringify(bulkDestination.context) ||
      snapshot.reason !== reason ||
      snapshot.exportContext !== exportContext
    )
      return 'The workspace changed after preview. Preview the batch again.';
    const version = bulkEditVersion.current;
    try {
      let candidate = applyFlashcardOperations(bank, subjects, batch);
      setBusy(true);
      candidate = await onSaveBank(candidate, reason);
      if (bulkEditVersion.current !== version)
        return 'The captured batch was saved. Newer text is kept. Review or remove already saved entries before another batch save.';
      setIssues([]);
      setSelection(undefined);
      setEditor('');
      setLoadedEditor('');
      setBulkDestination(undefined);
      setBulkDraftDirty(false);
      let first = batch.find((operation) => operation.op === 'card.create' || operation.op === 'deck.create');
      if (first?.op === 'card.create') {
        const value = candidate.cards.find((row) => !bank.cards.some((old) => old.id === row.id));
        if (value) first = { ...first, value };
      }
      if (first?.op === 'deck.create') {
        const value = candidate.decks.find((row) => !bank.decks.some((old) => old.id === row.id));
        if (value) first = { ...first, value };
      }
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
      return error instanceof Error ? error.message : 'Unable to save the bulk flashcard batch.';
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  const openBulk = async (context: FlashcardBulkAddContext, label: string) => {
    if (busy || externalBusy || (editorDirty && !(await discardDraft()))) return;
    if (editorDirty) {
      setSelection(undefined);
      setEditor('');
      setLoadedEditor('');
    }
    setBulkDraftDirty(false);
    setBulkDestination({ context, label });
  };
  const stage = async () => {
    if (!selection || busy || externalBusy) return;
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
    const version = editVersion.current;
    const provisionalId = record.id as string;
    const staged = commitOperation(op);
    const candidate = staged instanceof Promise ? await staged : staged;
    if (!candidate) return;
    const actual = selection.id ? value : selection.kind === 'deck' ? candidate.decks.at(-1) : candidate.cards.at(-1);
    const text = JSON.stringify(actual, null, 2);
    Object.assign(record, actual);
    setSelection({ kind: selection.kind, id: record.id as string });
    setLoadedEditor(text);
    if (editVersion.current === version) setEditor(text);
    else if (!selection.id) setEditor((latest) => adoptReservedDraftId(latest, provisionalId, record.id as string));
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
  const createRecord = (kind: Kind) => {
    const parentId = kind === 'deck' ? browseSubjectId : browseDeckId;
    if (!parentId) return;
    const value =
      kind === 'deck'
        ? { id: `d-${crypto.randomUUID()}`, subjectId: parentId, name: 'New deck' }
        : { id: `f-${crypto.randomUUID()}`, deckId: parentId, front: 'Question', back: 'Answer' };
    load({ kind, id: '' }, value);
  };
  const deletionKey = useMemo(() => JSON.stringify([bank, subjects]), [bank, subjects]);
  const remove = (kind: Kind, id: string) => {
    if (busy || externalBusy) return;
    const row = kind === 'deck' ? bank.decks.find((row) => row.id === id) : bank.cards.find((row) => row.id === id);
    if (!row) return;
    setDeleteError('');
    setDeleteRequest({ selection: { kind, id }, label: 'name' in row ? row.name : row.front, reviewKey: deletionKey });
  };
  const confirmDelete = async () => {
    if (!deleteRequest || busy || externalBusy) return;
    if (deleteRequest.reviewKey !== deletionKey) {
      setDeleteError('The content changed. Cancel and review the deletion again.');
      return;
    }
    if (editorDirty && !(await discardDraft())) return;
    const ids = deleteRequest.ids ?? [deleteRequest.selection.id!];
    const batch = ids.map((id) =>
      deleteRequest.selection.kind === 'deck'
        ? { op: 'deck.delete' as const, id, cascade: true as const }
        : { op: 'card.delete' as const, id },
    );
    if (!(await commitOperations(batch))) {
      setDeleteError(lastSaveCanceled.current ? '' : 'The deletion was not saved. Review the listed issues.');
      return;
    }
    setDeleteRequest(undefined);
    recordSelection.clear();
    setSelection(undefined);
    setEditor('');
    setLoadedEditor('');
  };
  const reorder = async (direction: -1 | 1) => {
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
    const result = commitOperation({
      op: `${selection.kind}.move`,
      id: selection.id,
      ...(afterId ? { afterId } : { first: true }),
    } as FlashcardAdminOperation);
    const resultBank = result instanceof Promise ? await result : result;
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
  const siblingRows =
    selection?.kind === 'deck'
      ? bank.decks.filter((row) => row.subjectId === bank.decks.find((item) => item.id === selection.id)?.subjectId)
      : bank.cards.filter((row) => row.deckId === bank.cards.find((item) => item.id === selection?.id)?.deckId);
  const siblingIndex = siblingRows.findIndex((row) => row.id === selection?.id);
  return (
    <Stack
      component="div"
      sx={{ border: 0, p: 0, m: 0, minWidth: 0, width: '100%' }}
      direction={{ xs: 'column', lg: 'row' }}
      spacing={2}
      alignItems="flex-start"
    >
      <Paper
        component="section"
        aria-label="Flashcard navigator"
        variant="outlined"
        sx={{ ...adminNavigatorLayout, p: 2 }}
      >
        <Stack
          component="fieldset"
          disabled={busy || externalBusy}
          spacing={1}
          sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
        >
          <Autocomplete
            inputValue={subjectQuery ?? subjects.find((subject) => subject.id === browseSubjectId)?.name ?? ''}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') setSubjectQuery(value);
            }}
            options={[...subjects]}
            value={subjects.find((subject) => subject.id === browseSubjectId) ?? null}
            getOptionLabel={(subject) => subject.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, subject) => {
              changeBrowseSubject(subject?.id ?? '');
              setSubjectQuery(undefined);
              setDeckQuery(undefined);
            }}
            renderInput={(params) => <TextField {...params} label="Subject" size="small" />}
          />
          <Button size="small" color="inherit" onClick={() => onManageSubjects(browseSubjectId || undefined)}>
            Manage subjects…
          </Button>
          {!browseSubjectId && (
            <Stack direction="row">
              <Button size="small" onClick={onAddSubject}>Add subject</Button>
            </Stack>
          )}
          {browseSubjectId && (
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                onClick={() =>
                  openBulk(
                    { kind: 'subject', subjectId: browseSubjectId },
                    subjects.find((subject) => subject.id === browseSubjectId)?.name ?? '',
                  )
                }
              >
                Add decks
              </Button>
              <AdminParentActions
                entity="Subject"
                onEdit={() => {
                  const subject = subjects.find((row) => row.id === browseSubjectId);
                  if (subject) onEditSubject(subject.id, subject.name);
                }}
                onDelete={() => {
                  const subject = subjects.find((row) => row.id === browseSubjectId);
                  if (subject) onDeleteSubject(subject.id, subject.name);
                }}
              />
            </Stack>
          )}
          {browseSubjectId && (
            <Autocomplete
              inputValue={
                deckQuery ?? (browseDeck ? `${browseDeck.name} · ${cardsByDeck[browseDeck.id]?.length ?? 0} cards` : '')
              }
              onInputChange={(_, value, reason) => {
                if (reason === 'input') setDeckQuery(value);
              }}
              options={browseDecks}
              value={browseDeck ?? null}
              getOptionLabel={(deck) => `${deck.name} · ${cardsByDeck[deck.id]?.length ?? 0} cards`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, deck) => {
                changeBrowseDeck(deck?.id ?? '');
                setDeckQuery(undefined);
              }}
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
                    openBulk(
                      { kind: 'deck', deckId: browseDeckId },
                      `${subjects.find((subject) => subject.id === browseSubjectId)?.name ?? ''} / ${browseDecks.find((deck) => deck.id === browseDeckId)?.name ?? ''}`,
                    )
                  }
                >
                  Add cards
                </Button>
                <AdminParentActions
                  entity="Deck"
                  onEdit={() =>
                    void load(
                      { kind: 'deck', id: browseDeckId },
                      browseDecks.find((deck) => deck.id === browseDeckId),
                    )
                  }
                  onDelete={() => remove('deck', browseDeckId)}
                />
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
              <AdminRecordSelection
                selection={recordSelection}
                pageIds={cardResults.visible.map(({ card }) => card.id)}
                onDelete={(ids) => {
                  setDeleteError('');
                  setDeleteRequest({
                    selection: { kind: 'card', parentId: browseDeckId },
                    ids,
                    label: `${ids.length} selected cards`,
                    reviewKey: deletionKey,
                  });
                }}
              />
              <Box
                component="nav"
                aria-label="Flashcards in selected deck"
                sx={{ overflowY: 'auto', maxHeight: { xs: '40dvh', lg: '50vh' } }}
              >
                {cardResults.visible.map(({ card, position }) => (
                  <Stack key={card.id} direction="row" alignItems="center">
                    {recordSelection.enabled && (
                      <Checkbox
                        size="small"
                        checked={recordSelection.ids.includes(card.id)}
                        onChange={() => recordSelection.toggle(card.id)}
                        slotProps={{ input: { 'aria-label': `Select card ${card.id}` } }}
                      />
                    )}
                    <ListItemButton
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
                  </Stack>
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
        </Stack>
      </Paper>
      <AdminEditorFrame label="Flashcard editor">
        <Stack spacing={2}>
          {selection && (
            <Typography variant="h6">
              {selection.id ? 'Edit' : 'Create'} {selection.kind}
            </Typography>
          )}
          {!selection ? (
            <AdminEditorEmpty
              title={!browseSubjectId ? 'Choose a subject' : !browseDeckId ? 'Choose a deck' : 'Choose a card'}
            >
              {browseSubjectId ? (
                <Button
                  onClick={() =>
                    openBulk(
                      browseDeckId
                        ? { kind: 'deck', deckId: browseDeckId }
                        : { kind: 'subject', subjectId: browseSubjectId },
                      browseDeck?.name ?? subjects.find((row) => row.id === browseSubjectId)?.name ?? '',
                    )
                  }
                >
                  {browseDeckId ? 'Add cards' : 'Add decks'}
                </Button>
              ) : onAddSubject ? (
                <Button onClick={onAddSubject}>Add subject</Button>
              ) : null}
            </AdminEditorEmpty>
          ) : (
            <>
              <AdminRecordEditor
                kind={selection.kind}
                existing={Boolean(selection.id)}
                expectedId={selection.id}
                text={editor}
                onChange={(value) => {
                  editVersion.current++;
                  onEdit?.();
                  setEditor(value);
                }}
              />
              <TextField
                label="Change reason"
                required
                error={!reason.trim()}
                helperText={!reason.trim() ? 'Enter a reason for this saved change.' : undefined}
                value={reason}
                onChange={(event) => {
                  onEdit?.();
                  setReason(event.target.value);
                }}
              />
            </>
          )}
          {notice && (
            <Alert severity="info" role="status">
              {notice}
            </Alert>
          )}
          {issues.length > 0 && (
            <Alert severity="error">
              <AdminIssues issues={issues.map((message) => ({ level: 'error', message }))} />
            </Alert>
          )}
          {warnings.length > 0 && (
            <Alert severity="warning">
              <AdminIssues issues={warnings} />
            </Alert>
          )}
          <AdminEditorActions dirty={editorDirty} busy={busy || externalBusy} statusVisible={Boolean(selection)}>
            {selection && (
              <Button variant="contained" disabled={!selection || busy || externalBusy} onClick={stage}>
                Review save
              </Button>
            )}
            <Button
              disabled={busy || externalBusy}
              size="small"
              aria-haspopup="menu"
              onClick={(event) => setActionAnchor(event.currentTarget)}
            >
              Record actions
            </Button>
            <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={() => setActionAnchor(null)}>
              <MenuItem
                disabled={!browseSubjectId}
                onClick={() => {
                  setActionAnchor(null);
                  createRecord('deck');
                }}
              >
                New deck
              </MenuItem>
              <MenuItem
                disabled={!browseDeckId}
                onClick={() => {
                  setActionAnchor(null);
                  createRecord('card');
                }}
              >
                New card
              </MenuItem>
              {selection?.id && (
                <MenuItem
                  onClick={() => {
                    setActionAnchor(null);
                    remove(selection.kind, selection.id);
                  }}
                >
                  Delete…
                </MenuItem>
              )}
              {selection?.id && (
                <MenuItem
                  disabled={siblingIndex <= 0}
                  onClick={() => {
                    setActionAnchor(null);
                    reorder(-1);
                  }}
                >
                  Move up
                </MenuItem>
              )}
              {selection?.id && (
                <MenuItem
                  disabled={siblingIndex < 0 || siblingIndex + 1 >= siblingRows.length}
                  onClick={() => {
                    setActionAnchor(null);
                    reorder(1);
                  }}
                >
                  Move down
                </MenuItem>
              )}
            </Menu>
          </AdminEditorActions>
        </Stack>
      </AdminEditorFrame>
      {confirmation.dialog}
      <AdminDeleteDialog
        recovery={recovery}
        commitLabel="Review"
        request={deleteRequest}
        bank={quizBank}
        flashcardBank={bank}
        currentReviewKey={deletionKey}
        busy={busy || externalBusy}
        error={deleteError}
        onClose={() => setDeleteRequest(undefined)}
        onConfirm={confirmDelete}
      />
      {bulkDestination && (
        <FlashcardBulkAddDialog
          recovery={recovery}
          open
          context={bulkDestination.context}
          destinationLabel={bulkDestination.label}
          bank={bank}
          subjects={subjects}
          reason={reason}
          onReasonChange={(value) => {
            bulkEditVersion.current++;
            onEdit?.();
            setReason(value);
          }}
          onEdit={() => {
            bulkEditVersion.current++;
            onEdit?.();
          }}
          exportContext={exportContext}
          busy={busy || externalBusy}
          onClose={() => setBulkDestination(undefined)}
          onDraftDirtyChange={setBulkDraftDirty}
          onStage={commitBulkOperations}
          commitLabel="Review save"
        />
      )}
    </Stack>
  );
}
