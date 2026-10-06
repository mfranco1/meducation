import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Divider, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import { storedFlashcardBank, serializeFlashcardBank, flashcardContentRevision } from '../content/flashcardBank';
import type { StoredFlashcardBank, StoredFlashcardDeck, StoredFlashcardTopic, StoredFlashcard } from '../content/schema';
import { validateStoredFlashcardBank } from '../content/validate';
import type { Subject } from '../domain/types';
import { storedQuestionBank } from '../content/questionBank';
import { applyFlashcardOperations, isFlashcardAdminChangeSet, replayFlashcardAdminChangeSet, type FlashcardAdminChangeSet, type FlashcardAdminOperation } from './core/flashcardChangeSet';

type Kind = 'topic' | 'deck' | 'card';
type Selected = { kind: Kind; id: string } | undefined;
const clone = (bank: StoredFlashcardBank): StoredFlashcardBank => structuredClone(bank);
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const download = (filename: string, contents: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  link.download = filename; link.click(); URL.revokeObjectURL(link.href);
};

/** Local-only authoring workspace. It exports reviewed JSON; it never writes canonical files. */
export function FlashcardAdminPanel({ subjects, onBankChange, quizRevision, originalQuizRevision, quizChangesStaged }: {
  subjects: readonly Subject[];
  onBankChange: (bank: StoredFlashcardBank) => void;
  quizRevision: string;
  originalQuizRevision: string;
  quizChangesStaged: boolean;
}) {
  const [bank, setBank] = useState(() => clone(storedFlashcardBank));
  const [selection, setSelection] = useState<Selected>();
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local flashcard content edit');
  const [issues, setIssues] = useState<string[]>([]);
  const [history, setHistory] = useState<StoredFlashcardBank[]>([]);
  const [historyOperationLengths, setHistoryOperationLengths] = useState<number[]>([]);
  const [operations, setOperations] = useState<FlashcardAdminOperation[]>([]);
  const [pendingImport, setPendingImport] = useState<{ changeSet: FlashcardAdminChangeSet; bank: StoredFlashcardBank }>();
  const [importFileError, setImportFileError] = useState<string>();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('beforeunload', protectDraft);
    return () => removeEventListener('beforeunload', protectDraft);
  }, [dirty]);
  const topicsBySubject = useMemo(() => bank.topics.reduce<Record<string, StoredFlashcardTopic[]>>((groups, topic) => ((groups[topic.subjectId] ??= []).push(topic), groups), {}), [bank]);
  const decksByTopic = useMemo(() => bank.decks.reduce<Record<string, StoredFlashcardDeck[]>>((groups, deck) => ((groups[deck.topicId] ??= []).push(deck), groups), {}), [bank]);
  const cardsByDeck = useMemo(() => bank.cards.reduce<Record<string, StoredFlashcard[]>>((groups, card) => ((groups[card.deckId] ??= []).push(card), groups), {}), [bank]);
  const remember = () => {
    setHistory(items => [...items, clone(bank)].slice(-10));
    setHistoryOperationLengths(items => [...items, operations.length].slice(-10));
  };
  const load = (next: Selected, value: unknown) => { setSelection(next); setEditor(JSON.stringify(value, null, 2)); setIssues([]); };
  const create = (kind: Kind, parentId: string) => {
    if (kind === 'topic') load({ kind, id: '' }, { id: makeId('t'), subjectId: parentId, name: 'New topic' });
    if (kind === 'deck') load({ kind, id: '' }, { id: makeId('d'), topicId: parentId, name: 'New deck' });
    if (kind === 'card') load({ kind, id: '' }, { id: makeId('f'), deckId: parentId, front: 'Question', back: 'Answer' });
  };
  const stage = () => {
    if (!selection) return;
    let value: unknown;
    try { value = JSON.parse(editor); } catch { setIssues(['Record JSON is invalid.']); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { setIssues(['Record must be a JSON object.']); return; }
    const record = value as Record<string, unknown>;
    if (selection.id && record.id !== selection.id) { setIssues(['IDs are stable and cannot be changed.']); return; }
    const candidate = clone(bank);
    const collection = selection.kind === 'topic' ? candidate.topics : selection.kind === 'deck' ? candidate.decks : candidate.cards;
    const index = selection.id ? collection.findIndex(row => row.id === selection.id) : -1;
    if (selection.id && index < 0) { setIssues(['The selected record no longer exists.']); return; }
    if (index >= 0) collection[index] = value as never; else collection.push(value as never);
    const validation = validateStoredFlashcardBank(candidate, [...subjects]).filter(issue => issue.level === 'error');
    if (validation.length) { setIssues(validation.map(issue => issue.message)); return; }
    const op = { op: `${selection.kind}.${selection.id ? 'update' : 'create'}`, ...(selection.id ? { id: selection.id } : {}), value } as FlashcardAdminOperation;
    setOperations(items => [...items, op]);
    remember(); setBank(candidate); onBankChange(candidate); setDirty(true); setIssues([]);
    setSelection({ kind: selection.kind, id: record.id as string }); setEditor(JSON.stringify(value, null, 2));
  };
  const remove = (kind: Kind, id: string) => {
    const candidate = clone(bank);
    let operation: FlashcardAdminOperation;
    if (kind === 'topic') {
      const decks = candidate.decks.filter(deck => deck.topicId === id); const deckIds = new Set(decks.map(deck => deck.id));
      if ((decks.length || candidate.cards.some(card => deckIds.has(card.deckId))) && !window.confirm(`Delete this topic, ${decks.length} deck(s), and their cards?`)) return;
      candidate.topics = candidate.topics.filter(topic => topic.id !== id); candidate.decks = candidate.decks.filter(deck => deck.topicId !== id); candidate.cards = candidate.cards.filter(card => !deckIds.has(card.deckId));
      operation = { op: 'topic.delete', id, cascade: true };
    } else if (kind === 'deck') {
      const count = candidate.cards.filter(card => card.deckId === id).length;
      if (count && !window.confirm(`Delete this deck and its ${count} card(s)?`)) return;
      candidate.decks = candidate.decks.filter(deck => deck.id !== id); candidate.cards = candidate.cards.filter(card => card.deckId !== id);
      operation = { op: 'deck.delete', id, cascade: true };
    } else { candidate.cards = candidate.cards.filter(card => card.id !== id); operation = { op: 'card.delete', id }; }
    const errors = validateStoredFlashcardBank(candidate, [...subjects]).filter(issue => issue.level === 'error');
    if (errors.length) { setIssues(errors.map(issue => issue.message)); return; }
    setOperations(items => [...items, operation]); remember(); setBank(candidate); onBankChange(candidate); setDirty(true); setSelection(undefined); setEditor(''); setIssues([]);
  };
  const reorder = (direction: -1 | 1) => {
    if (!selection) return;
    const candidate = clone(bank);
    const rows = selection.kind === 'topic' ? candidate.topics : selection.kind === 'deck' ? candidate.decks : candidate.cards;
    const row = rows.find(item => item.id === selection.id);
    if (!row) return;
    const parentId = selection.kind === 'topic' ? ('subjectId' in row ? row.subjectId : '')
      : selection.kind === 'deck' ? ('topicId' in row ? row.topicId : '')
        : ('deckId' in row ? row.deckId : '');
    const hasSameParent = (item: typeof row) => selection.kind === 'topic' ? 'subjectId' in item && item.subjectId === parentId
      : selection.kind === 'deck' ? 'topicId' in item && item.topicId === parentId
        : 'deckId' in item && item.deckId === parentId;
    const siblings = rows.map((item, index) => ({ item, index })).filter(({ item }) => hasSameParent(item));
    const siblingPosition = siblings.findIndex(({ item }) => item.id === selection.id);
    const target = siblings[siblingPosition + direction];
    if (!target) return;
    const sourceIndex = siblings[siblingPosition].index;
    [rows[sourceIndex], rows[target.index]] = [rows[target.index], rows[sourceIndex]];
    const afterPosition = direction === -1 ? siblingPosition - 2 : siblingPosition + 1;
    const afterId = siblings[afterPosition]?.item.id;
    setOperations(items => [...items, { op: `${selection.kind}.move`, id: selection.id, ...(afterId ? { afterId } : { first: true }) } as FlashcardAdminOperation]);
    remember(); setBank(candidate); onBankChange(candidate); setDirty(true);
  };
  const undo = () => {
    const previous = history.at(-1); if (!previous) return;
    const operationLength = historyOperationLengths.at(-1) ?? 0;
    setBank(previous); onBankChange(previous); setHistory(items => items.slice(0, -1)); setHistoryOperationLengths(items => items.slice(0, -1)); setOperations(items => items.slice(0, operationLength)); setDirty(operationLength > 0);
  };
  const reset = () => {
    if (dirty && !window.confirm('Discard every staged flashcard change?')) return;
    const initial = clone(storedFlashcardBank);
    setBank(initial); onBankChange(initial); setHistory([]); setHistoryOperationLengths([]); setOperations([]); setDirty(false); setSelection(undefined); setEditor(''); setIssues([]);
  };
  const exportFiles = async () => {
    if (!reason.trim()) { setIssues(['A change reason is required before export.']); return; }
    const baseRevision = await flashcardContentRevision(storedFlashcardBank);
    const nextRevision = await flashcardContentRevision(bank, [...subjects]);
    const digestSubjects = async (records: readonly Subject[]) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
      return `sha256-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    };
    const baseSubjectRevision = await digestSubjects(storedQuestionBank.subjects);
    const resultSubjectRevision = await digestSubjects(subjects);
    const replayed = applyFlashcardOperations(storedFlashcardBank, [...subjects], operations);
    if (serializeFlashcardBank(replayed) !== serializeFlashcardBank(bank)) { setIssues(['The staged operation list does not reproduce the current flashcard bank. Reset and restage the affected records.']); return; }
    const changeSet = { changeSetVersion: 1, base: { schemaVersion: 1, revision: baseRevision, subjectRevision: baseSubjectRevision }, resultRevision: nextRevision, resultSubjectRevision, reason, operations };
    if (!isFlashcardAdminChangeSet(changeSet)) { setIssues(['The staged change set is invalid. Review staged records before exporting.']); return; }
    download('flashcardBank.generated.json', serializeFlashcardBank(bank));
    download('flashcard-bank-change-set.json', `${JSON.stringify(changeSet, null, 2)}\n`);
    if (quizChangesStaged) download('content-export-manifest.json', `${JSON.stringify({ manifestVersion: 1, coordinated: true, files: ['questionBank.generated.json', 'flashcardBank.generated.json'], subjectCatalog: { baseRevision: originalQuizRevision, resultRevision: quizRevision }, flashcards: { resultRevision: nextRevision }, replaceTogether: true }, null, 2)}\n`);
    setDirty(false);
  };
  const previewImport = async (file?: File) => {
    setPendingImport(undefined); setImportFileError(undefined);
    if (!file) return;
    if (dirty) { setImportFileError('Export, reset, or undo the staged changes before previewing an import.'); return; }
    try {
      const input: unknown = JSON.parse(await file.text());
      if (!isFlashcardAdminChangeSet(input)) throw new Error('The file is not a valid flashcard change set.');
      const next = await replayFlashcardAdminChangeSet(storedFlashcardBank, storedQuestionBank.subjects, input, subjects);
      setPendingImport({ changeSet: input, bank: next });
    } catch (error) { setImportFileError(error instanceof Error ? error.message : 'Unable to preview this flashcard change set.'); }
  };
  const stageImport = () => {
    if (!pendingImport) return;
    remember(); setBank(pendingImport.bank); onBankChange(pendingImport.bank);
    setOperations(pendingImport.changeSet.operations); setReason(pendingImport.changeSet.reason); setDirty(true); setSelection(undefined); setEditor(''); setPendingImport(undefined);
  };

  return <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
    <Paper variant="outlined" sx={{ width: { lg: 340 }, p: 2, maxHeight: { lg: '78vh' }, overflow: 'auto' }}>
      <Stack spacing={1}><Typography variant="h6">Flashcard content</Typography><Typography variant="caption" color="text.secondary">Subjects come from the quiz subject catalog.</Typography>
      <List dense>{subjects.map(subject => <Box key={subject.id}><ListItemText primary={subject.name} secondary={subject.id} />
        <Button size="small" onClick={() => create('topic', subject.id)}>Add topic</Button>
        {topicsBySubject[subject.id]?.map(topic => <Box key={topic.id} sx={{ pl: 2 }}>
          <ListItemButton selected={selection?.kind === 'topic' && selection.id === topic.id} onClick={() => load({ kind: 'topic', id: topic.id }, topic)}><ListItemText primary={topic.name} secondary="Topic" /></ListItemButton>
          <Button size="small" onClick={() => create('deck', topic.id)}>Add deck</Button>
          {decksByTopic[topic.id]?.map(deck => <Box key={deck.id} sx={{ pl: 2 }}>
            <ListItemButton selected={selection?.kind === 'deck' && selection.id === deck.id} onClick={() => load({ kind: 'deck', id: deck.id }, deck)}><ListItemText primary={deck.name} secondary={`${cardsByDeck[deck.id]?.length ?? 0} cards`} /></ListItemButton>
            <Button size="small" onClick={() => create('card', deck.id)}>Add card</Button>
            {cardsByDeck[deck.id]?.map(card => <ListItemButton key={card.id} sx={{ pl: 4 }} selected={selection?.kind === 'card' && selection.id === card.id} onClick={() => load({ kind: 'card', id: card.id }, card)}><ListItemText primary={card.front.slice(0, 50)} secondary="Card" /></ListItemButton>)}
          </Box>)}
        </Box>)}
      </Box>)}</List></Stack>
    </Paper>
    <Paper variant="outlined" sx={{ flex: 1, p: 2, minWidth: 0 }}><Stack spacing={2}>
      <Typography variant="h6">{selection ? `${selection.id ? 'Edit' : 'Create'} ${selection.kind}` : 'Select a topic, deck, or card'}</Typography>
      <TextField label="Reason" value={reason} onChange={event => setReason(event.target.value)} required />
      <TextField label="Record JSON" value={editor} onChange={event => setEditor(event.target.value)} multiline minRows={14} fullWidth InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} />
      {issues.length > 0 && <Alert severity="error"><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Alert>}
      <Stack direction="row" spacing={1} flexWrap="wrap"><Button variant="contained" disabled={!selection} onClick={stage}>Stage record</Button>
        <Button color="error" disabled={!selection?.id} onClick={() => selection && remove(selection.kind, selection.id)}>Delete</Button>
        <Button disabled={!selection?.id} onClick={() => reorder(-1)}>Move up</Button><Button disabled={!selection?.id} onClick={() => reorder(1)}>Move down</Button>
        <Divider flexItem orientation="vertical" /><Button disabled={!history.length} onClick={undo}>Undo</Button><Button disabled={!dirty} onClick={reset}>Reset</Button>
        <Button variant="outlined" color="success" disabled={!dirty} onClick={() => void exportFiles()}>Export flashcard JSON and change set</Button>
        <Button onClick={() => importFileRef.current?.click()} disabled={dirty}>Import change set</Button>
        <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={event => { void previewImport(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      </Stack>
      {pendingImport && <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={1}>
        <Typography variant="subtitle1">Import preview</Typography>
        <Typography variant="body2" color="text.secondary">{pendingImport.changeSet.operations.length} operation(s) · {pendingImport.changeSet.reason}</Typography>
        <TextField label="Resulting flashcard bank" value={serializeFlashcardBank(pendingImport.bank)} multiline minRows={8} fullWidth InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} />
        <Stack direction="row" spacing={1}><Button variant="contained" onClick={stageImport}>Stage import</Button><Button onClick={() => setPendingImport(undefined)}>Cancel</Button></Stack>
      </Stack></Paper>}
      {importFileError && <Alert severity="error">{importFileError}</Alert>}
      {dirty && <Alert severity="info">Changes are staged in this browser session. Export the JSON and change set, review them, then replace the canonical file.</Alert>}
    </Stack></Paper>
  </Stack>;
}
