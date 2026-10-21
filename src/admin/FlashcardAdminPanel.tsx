import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Alert,
  Box,
  Button,
  Checkbox,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Subject } from '../domain/types';
import { AdminRecordEditor } from './components/AdminRecordEditor';
import { AdminParentActions } from './components/AdminParentActions';
import { AdminEditorFrame, AdminEditorEmpty, AdminEditorActions } from './components/AdminEditorFrame';
import { AdminRecordFeedback } from './components/AdminRecordFeedback';
import { AdminRecordMenu } from './components/AdminRecordMenu';
import { adminNavigatorLayout } from './components/AdminNavigatorPanel';
import { AdminRecordSelection, useAdminRecordSelection } from './components/AdminRecordSelection';
import { AdminTopicFilter, topicTotals } from './components/AdminTopicFilter';
import type { DeleteRequest } from './components/AdminDeleteDialog';
import { FlashcardBulkAddDialog } from './FlashcardBulkAddDialog';
import type { FlashcardBulkAddContext } from './core/flashcardBulkAddDraft';
import { ADMIN_PAGE_SIZE, filterTopics, selectFlashcardPage, type TopicFilter } from './core/navigator';
import { reorderTarget } from './core/reorder';
import { errorMessages } from './data/PairedHttpClient';
import type { BulkPlan, DraftStore, StoredRecord } from './data/DraftStore';
import { useRecordEditor } from './useRecordEditor';

/** Decks and cards: browse by subject, topic and deck, edit one record, add in bulk, reorder, delete. */
export function FlashcardAdminPanel({
  store,
  blocked = false,
  onDelete,
  onAddSubject,
  onEditSubject,
  onManageSubjects,
  onDeleteSubject,
  onDirtyChange,
}: {
  store: DraftStore;
  blocked?: boolean;
  onDelete: (request: DeleteRequest) => void;
  onAddSubject: () => void;
  onManageSubjects: (id?: string) => void;
  onEditSubject: (subjectId: string) => void;
  onDeleteSubject: (subjectId: string, subjectName: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const bank = store.flashcardBank;
  const subjects: readonly Subject[] = store.quizBank.subjects;
  const topics = store.quizBank.topics;
  const [browseSubjectId, setBrowseSubjectId] = useState('');
  const [browseTopicId, setBrowseTopicId] = useState('');
  const [browseDeckId, setBrowseDeckId] = useState('');
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
  const [subjectQuery, setSubjectQuery] = useState<string>();
  const [topicQuery, setTopicQuery] = useState<string>();
  const [deckQuery, setDeckQuery] = useState<string>();
  const [cardQuery, setCardQuery] = useState('');
  const [cardPage, setCardPage] = useState(0);
  const [bulk, setBulk] = useState<{ context: FlashcardBulkAddContext; label: string }>();
  const [bulkDirty, setBulkDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const editor = useRecordEditor(store, { blocked, draftLabel: 'flashcard', fallback: () => undefined });
  const selection = editor.selection;
  const locked = working || editor.busy || blocked;

  const decksByTopic = useMemo(
    () =>
      bank.decks.reduce<Record<string, typeof bank.decks>>(
        (groups, deck) => ((groups[deck.topicId] ??= []).push(deck), groups),
        {},
      ),
    [bank],
  );
  const cardsByDeck = useMemo(
    () =>
      bank.cards.reduce<Record<string, typeof bank.cards>>(
        (groups, card) => ((groups[card.deckId] ??= []).push(card), groups),
        {},
      ),
    [bank],
  );
  const browseTopics = topics.filter((topic) => topic.subjectId === browseSubjectId);
  const browseTopic = browseTopics.find((topic) => topic.id === browseTopicId);
  const browseDecks = decksByTopic[browseTopicId] ?? [];
  const browseDeck = browseDecks.find((deck) => deck.id === browseDeckId);
  const deckCards = browseDeck ? (cardsByDeck[browseDeck.id] ?? []) : [];
  const cardResults = selectFlashcardPage(deckCards, cardQuery, cardPage);
  const listRows = browseDeck
    ? []
    : browseTopic
      ? browseDecks.map((deck) => ({
          id: deck.id,
          primary: deck.name,
          secondary: `${cardsByDeck[deck.id]?.length ?? 0} cards`,
          open: () => changeBrowse(browseSubjectId, browseTopicId, deck.id),
        }))
      : browseSubjectId
        ? filterTopics(browseTopics, { ...store.quizBank, ...bank }, topicFilter).map((row) => ({
            id: row.topic.id,
            primary: row.topic.name,
            secondary: `${row.topic.id} · ${topicTotals(row)}`,
            open: () => changeBrowse(browseSubjectId, row.topic.id, ''),
          }))
        : [];
  const recordSelection = useAdminRecordSelection(
    JSON.stringify([browseSubjectId, browseTopicId, browseDeckId, cardQuery]),
    browseDeck ? deckCards.map((row) => row.id) : listRows.map((row) => row.id),
  );
  useEffect(() => {
    onDirtyChange?.(editor.dirty || bulkDirty);
  }, [editor.dirty, bulkDirty, onDirtyChange]);
  useEffect(() => {
    if (browseSubjectId && !subjects.some((subject) => subject.id === browseSubjectId)) {
      setBrowseSubjectId('');
      setBrowseTopicId('');
      setBrowseDeckId('');
    } else if (browseTopicId && !topics.some((topic) => topic.id === browseTopicId)) {
      setBrowseTopicId('');
      setBrowseDeckId('');
    } else if (browseDeckId && !bank.decks.some((deck) => deck.id === browseDeckId)) setBrowseDeckId('');
  }, [bank.decks, browseDeckId, browseTopicId, browseSubjectId, subjects, topics]);
  // Follow the open record: after a save or reorder the list shows the deck and page that hold it.
  const openKind = selection?.kind;
  const openId = selection?.id;
  const openParent = selection?.parentId;
  useEffect(() => {
    if (!openId) return;
    const showDeck = (deckId: string) => {
      const deck = store.flashcardBank.decks.find((row) => row.id === deckId);
      const topic = store.quizBank.topics.find((row) => row.id === deck?.topicId);
      if (!deck || !topic) return false;
      setBrowseSubjectId(topic.subjectId);
      setBrowseTopicId(topic.id);
      setBrowseDeckId(deck.id);
      return true;
    };
    if (openKind === 'topic') {
      const topic = store.quizBank.topics.find((row) => row.id === openId);
      if (topic) {
        setBrowseSubjectId(topic.subjectId);
        setBrowseTopicId(topic.id);
      }
    } else if (openKind === 'deck') showDeck(openId);
    else if (openKind === 'card' && openParent) {
      if (!showDeck(openParent)) return;
      const cards = store.flashcardBank.cards.filter((row) => row.deckId === openParent);
      setCardPage((page) => {
        const index = cards.findIndex((row) => row.id === openId);
        return index < 0 ? page : Math.floor(index / ADMIN_PAGE_SIZE);
      });
    }
  }, [store, openKind, openId, openParent]);

  const changeBrowse = async (subjectId: string, topicId: string, deckId: string) => {
    if (locked || !(await editor.select(undefined))) return;
    setBrowseSubjectId(subjectId);
    setBrowseTopicId(topicId);
    setBrowseDeckId(deckId);
    setCardQuery('');
    setCardPage(0);
  };
  const openRecord = (
    kind: 'topic' | 'deck' | 'card',
    record: StoredRecord & { deckId?: string; topicId?: string; subjectId?: string },
  ) => void editor.load({ kind, id: record.id, parentId: record.deckId ?? record.topicId ?? record.subjectId }, record);
  const createRecord = (kind: 'topic' | 'deck' | 'card') => {
    const parentId = kind === 'topic' ? browseSubjectId : kind === 'deck' ? browseTopicId : browseDeckId;
    if (parentId) void editor.loadNew(kind, parentId);
  };
  const run = async (action: () => Promise<unknown>) => {
    setWorking(true);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(errorMessages(error).join(' '));
    } finally {
      setWorking(false);
    }
  };
  const siblings =
    selection?.kind === 'topic'
      ? topics.filter((row) => row.subjectId === selection.parentId)
      : selection?.kind === 'deck'
        ? bank.decks.filter((row) => row.topicId === selection.parentId)
        : bank.cards.filter((row) => row.deckId === selection?.parentId);
  const siblingIndex = siblings.findIndex((row) => row.id === selection?.id);
  const reorder = (direction: -1 | 1) =>
    run(async () => {
      if (!selection?.id) return;
      const { kind, id } = selection;
      const record = store.find(kind, id);
      const target = reorderTarget(siblings, id, direction);
      if (!record || !target) return;
      await store.move(kind, id, record.version, target);
      if (kind === 'card') {
        const visible = selectFlashcardPage(store.flashcardBank.cards.filter((row) => row.deckId === selection.parentId), cardQuery, 0);
        const index = visible.matches.findIndex(({ card }) => card.id === id);
        if (index >= 0) setCardPage(Math.floor(index / ADMIN_PAGE_SIZE));
      }
    });
  const saveBulk = async (plan: BulkPlan) => {
    setWorking(true);
    try {
      const result = await store.addTree(plan);
      const deckId = result.parentIds[0] ?? plan.topics[0]?.groups[0]?.parentId;
      if (deckId) {
        const deck = store.flashcardBank.decks.find((row) => row.id === deckId);
        const topic = store.quizBank.topics.find((row) => row.id === deck?.topicId);
        if (deck && topic) {
          setBrowseSubjectId(topic.subjectId);
          setBrowseTopicId(topic.id);
          setBrowseDeckId(deck.id);
          setCardQuery('');
          setCardPage(0);
        }
      }
      return undefined;
    } catch (error) {
      return errorMessages(error);
    } finally {
      setWorking(false);
    }
  };
  const openBulk = async (context: FlashcardBulkAddContext, label: string) => {
    if (locked || (editor.dirty && !(await editor.select(undefined)))) return;
    setBulk({ context, label });
  };
  const subjectName = subjects.find((subject) => subject.id === browseSubjectId)?.name ?? '';
  const topicLabel = browseTopic ? `${subjectName} / ${browseTopic.name}` : subjectName;
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
        <Stack component="fieldset" disabled={locked} spacing={1} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
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
              if ((subject?.id ?? '') !== browseSubjectId) void changeBrowse(subject?.id ?? '', '', '');
              setSubjectQuery(undefined);
              setTopicQuery(undefined);
              setDeckQuery(undefined);
            }}
            renderInput={(params) => <TextField {...params} label="Subject" size="small" />}
          />
          <Button size="small" color="inherit" onClick={() => onManageSubjects(browseSubjectId || undefined)}>
            Manage subjects…
          </Button>
          {!browseSubjectId && (
            <Stack direction="row">
              <Button size="small" onClick={onAddSubject}>
                Add subject
              </Button>
            </Stack>
          )}
          {browseSubjectId && (
            <Stack direction="row" spacing={0.5}>
              <Button size="small" onClick={() => createRecord('topic')}>
                New topic
              </Button>
              <Button size="small" onClick={() => void openBulk({ kind: 'subject', subjectId: browseSubjectId }, subjectName)}>
                Add topics
              </Button>
              <AdminParentActions
                entity="Subject"
                onEdit={() => onEditSubject(browseSubjectId)}
                onDelete={() => onDeleteSubject(browseSubjectId, subjectName)}
              />
            </Stack>
          )}
          {browseSubjectId && (
            <Autocomplete
              inputValue={topicQuery ?? browseTopic?.name ?? ''}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') setTopicQuery(value);
              }}
              options={browseTopics}
              value={browseTopic ?? null}
              getOptionLabel={(topic) => topic.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, topic) => {
                if ((topic?.id ?? '') !== browseTopicId) void changeBrowse(browseSubjectId, topic?.id ?? '', '');
                setTopicQuery(undefined);
                setDeckQuery(undefined);
              }}
              renderInput={(params) => <TextField {...params} label="Topic" size="small" />}
            />
          )}
          {browseSubjectId && !browseTopics.length && <Typography variant="body2">No topics in this subject.</Typography>}
          {browseTopic && (
            <Stack direction="row" spacing={0.5}>
              <Button size="small" onClick={() => void openBulk({ kind: 'topic', topicId: browseTopic.id }, topicLabel)}>
                Add decks
              </Button>
              <AdminParentActions
                entity="Topic"
                onEdit={() => openRecord('topic', browseTopic)}
                onDelete={() => onDelete({ selection: { kind: 'topic', id: browseTopic.id }, label: browseTopic.name })}
              />
            </Stack>
          )}
          {browseTopic && (
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
                if ((deck?.id ?? '') !== browseDeckId) void changeBrowse(browseSubjectId, browseTopicId, deck?.id ?? '');
                setDeckQuery(undefined);
              }}
              renderInput={(params) => <TextField {...params} label="Deck" size="small" />}
            />
          )}
          {browseTopic && !browseDecks.length && <Typography variant="body2">No decks in this topic.</Typography>}
          {browseSubjectId && !browseTopic && browseTopics.length > 0 && (
            <AdminTopicFilter value={topicFilter} onChange={setTopicFilter} />
          )}
          {browseSubjectId && !browseTopic && browseTopics.length > 0 && !listRows.length && (
            <Typography variant="body2">No topics match this filter.</Typography>
          )}
          {listRows.length > 0 && (
            <>
              <AdminRecordSelection
                selection={recordSelection}
                pageIds={listRows.map((row) => row.id)}
                onDelete={(ids) =>
                  onDelete({
                    selection: browseTopic ? { kind: 'deck', parentId: browseTopic.id } : { kind: 'topic', parentId: browseSubjectId },
                    ids,
                    label: `${ids.length} selected ${browseTopic ? 'decks' : 'topics'}`,
                  })
                }
              />
              <Box
                component="nav"
                aria-label={browseTopic ? `Decks in ${browseTopic.name}` : 'Topics in selected subject'}
                sx={{ overflowY: 'auto', maxHeight: { xs: '40dvh', lg: '50vh' } }}
              >
                {listRows.map((row) => (
                  <Stack key={row.id} direction="row" alignItems="center">
                    {recordSelection.enabled && (
                      <Checkbox
                        size="small"
                        checked={recordSelection.ids.includes(row.id)}
                        onChange={() => recordSelection.toggle(row.id)}
                        slotProps={{ input: { 'aria-label': `Select ${browseTopic ? 'deck' : 'topic'} ${row.id}` } }}
                      />
                    )}
                    <ListItemButton
                      onClick={() => void row.open()}
                      sx={{ borderRadius: '10px', mx: 0.5, width: 'calc(100% - 8px)' }}
                    >
                      <ListItemText primary={row.primary} secondary={row.secondary} />
                    </ListItemButton>
                  </Stack>
                ))}
              </Box>
            </>
          )}
          {browseDeck && (
            <>
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                <Button
                  size="small"
                  onClick={() => void openBulk({ kind: 'deck', deckId: browseDeck.id }, `${topicLabel} / ${browseDeck.name}`)}
                >
                  Add cards
                </Button>
                <AdminParentActions
                  entity="Deck"
                  onEdit={() => openRecord('deck', browseDeck)}
                  onDelete={() => onDelete({ selection: { kind: 'deck', id: browseDeck.id }, label: browseDeck.name })}
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
              <AdminRecordSelection
                selection={recordSelection}
                pageIds={cardResults.visible.map(({ card }) => card.id)}
                onDelete={(ids) =>
                  onDelete({
                    selection: { kind: 'card', parentId: browseDeck.id },
                    ids,
                    label: `${ids.length} selected cards`,
                  })
                }
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
                      onClick={() => openRecord('card', card)}
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
          {selection && editor.open && (
            <Typography variant="h6">
              {selection.id ? 'Edit' : 'Create'} {selection.kind}
            </Typography>
          )}
          {!selection || !editor.open ? (
            <AdminEditorEmpty
              title={
                !browseSubjectId
                  ? 'Choose a subject'
                  : !browseTopicId
                    ? 'Choose a topic'
                    : !browseDeckId
                      ? 'Choose a deck'
                      : 'Choose a card'
              }
            >
              {!browseSubjectId ? (
                <Button onClick={onAddSubject}>Add subject</Button>
              ) : !browseTopicId ? (
                <Button onClick={() => createRecord('topic')}>New topic</Button>
              ) : (
                <Button
                  onClick={() =>
                    void openBulk(
                      browseDeckId ? { kind: 'deck', deckId: browseDeckId } : { kind: 'topic', topicId: browseTopicId },
                      browseDeck?.name ?? topicLabel,
                    )
                  }
                >
                  {browseDeckId ? 'Add cards' : 'Add decks'}
                </Button>
              )}
            </AdminEditorEmpty>
          ) : (
            <AdminRecordEditor
              kind={selection.kind}
              existing={Boolean(selection.id)}
              expectedId={selection.id}
              text={editor.text}
              onChange={editor.edit}
            />
          )}
          {actionError && (
            <Alert severity="error" onClose={() => setActionError('')}>
              {actionError}
            </Alert>
          )}
          <AdminRecordFeedback
            issues={editor.issues}
            notice={editor.notice}
            conflict={editor.conflict}
            busy={locked}
            onUseServer={editor.takeServerVersion}
            onKeepMine={editor.keepMine}
          />
          <AdminEditorActions dirty={editor.dirty} busy={locked} statusVisible={Boolean(selection && editor.open)}>
            {selection && editor.open && (
              <Button variant="contained" disabled={locked} onClick={() => void editor.save()}>
                Save
              </Button>
            )}
            <AdminRecordMenu
              disabled={locked}
              items={[
                { label: 'New topic', disabled: !browseSubjectId, onClick: () => createRecord('topic') },
                { label: 'New deck', disabled: !browseTopicId, onClick: () => createRecord('deck') },
                { label: 'New card', disabled: !browseDeckId, onClick: () => createRecord('card') },
                {
                  label: 'Delete…',
                  hidden: !selection?.id,
                  onClick: () =>
                    selection?.id &&
                    onDelete({
                      selection: { kind: selection.kind, id: selection.id },
                      label:
                        selection.kind === 'deck'
                          ? (browseDeck?.name ?? selection.id)
                          : selection.kind === 'topic'
                            ? (browseTopic?.name ?? selection.id)
                            : selection.id,
                    }),
                },
                {
                  label: 'Move up',
                  hidden: !selection?.id,
                  disabled: editor.dirty || siblingIndex <= 0,
                  onClick: () => void reorder(-1),
                },
                {
                  label: 'Move down',
                  hidden: !selection?.id,
                  disabled: editor.dirty || siblingIndex < 0 || siblingIndex + 1 >= siblings.length,
                  onClick: () => void reorder(1),
                },
              ]}
            />
          </AdminEditorActions>
        </Stack>
      </AdminEditorFrame>
      {editor.discardDialog}
      {bulk && (
        <FlashcardBulkAddDialog
          context={bulk.context}
          destinationLabel={bulk.label}
          bank={bank}
          topics={topics}
          busy={locked}
          onClose={() => setBulk(undefined)}
          onDraftDirtyChange={setBulkDirty}
          onSave={saveBulk}
        />
      )}
    </Stack>
  );
}
