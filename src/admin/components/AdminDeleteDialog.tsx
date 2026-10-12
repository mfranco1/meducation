import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../content/schema/schema';
import type { Selection } from '../useAdminEditor';

export interface DeleteRequest { selection: Selection; label: string }

export function AdminDeleteDialog({ request, bank, flashcardBank, reason, error, onClose, onReasonChange, onConfirm }: {
  request?: DeleteRequest;
  bank: StoredQuestionBank;
  flashcardBank: StoredFlashcardBank;
  reason: string;
  error?: string;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const [showRecords, setShowRecords] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); setShowRecords(false); }, [request?.selection.kind, request?.selection.id]);
  const selection: Selection = request?.selection ?? { kind: 'subject' };
  const quizzes = selection.kind === 'subject' ? bank.quizzes.filter((quiz) => quiz.subjectId === selection.id) : [];
  const quizIds = new Set(quizzes.map((quiz) => quiz.id));
  const items = bank.questions.filter((question) => selection.kind === 'subject' ? quizIds.has(question.quizId) : selection.kind === 'quiz' ? question.quizId === selection.id : question.id === selection.id);
  const target = selection.id ? selection.kind === 'subject' ? bank.subjects.find((row) => row.id === selection.id) : selection.kind === 'quiz' ? bank.quizzes.find((row) => row.id === selection.id) : bank.questions.find((row) => row.id === selection.id) : undefined;
  const records = [...quizzes.map((row) => `Quiz · ${row.name} · ${row.id}`), ...items.map((row) => `Item · ${row.id}`)];
  const decks = selection.kind === 'subject' ? flashcardBank.decks.filter((deck) => deck.subjectId === selection.id) : [];
  const deckIds = new Set(decks.map((deck) => deck.id));
  const cards = flashcardBank.cards.filter((card) => deckIds.has(card.deckId));
  records.push(...decks.map((deck) => `Deck · ${deck.name} · ${deck.id}`), ...cards.map((card) => `Card · ${card.id}`));
  const targetLabel = target && 'name' in target ? target.name : target?.id;
  return <Dialog open={Boolean(request)} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="admin-delete-title">
    <DialogTitle id="admin-delete-title">Delete {selection.kind}?</DialogTitle>
    <DialogContent><Stack spacing={1.5}>
      <Typography>{request?.label ?? targetLabel ?? selection.id} · {selection.id}</Typography>
      <Typography variant="body2" color="text.secondary">This deletion will be staged locally and can be undone in this workspace. Export and review the updated content before replacing canonical files. Saved learner progress remains stored, but references to removed content may no longer be accessible.</Typography>
      <Typography variant="body2">Affected: {selection.kind === 'subject' ? `${quizzes.length} quizzes · ${items.length} items` : selection.kind === 'quiz' ? `${items.length} items` : 'this item'}.</Typography>
      {selection.kind === 'subject' && <Typography variant="body2">Flashcards: {decks.length} decks · {cards.length} cards.</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {records.length > 0 && <><Button size="small" onClick={() => setShowRecords((value) => !value)} aria-expanded={showRecords}>{showRecords ? 'Hide affected records' : `Review affected records (${records.length})`}</Button>{showRecords && <><Stack sx={{ maxHeight: 220, overflow: 'auto' }} spacing={.5}>{records.slice(page * 25, (page + 1) * 25).map((record) => <Typography key={record} variant="caption">{record}</Typography>)}</Stack><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="caption">{page * 25 + 1}–{Math.min(records.length, (page + 1) * 25)} of {records.length}</Typography><Stack direction="row"><Button size="small" disabled={!page} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button size="small" disabled={(page + 1) * 25 >= records.length} onClick={() => setPage((value) => Math.min(Math.floor((records.length - 1) / 25), value + 1))}>Next</Button></Stack></Stack></>}</>}
      <TextField id="admin-delete-reason" label="Reason" value={reason} onChange={(event) => onReasonChange(event.target.value)} required multiline minRows={2} fullWidth />
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose}>Cancel</Button><Button color="error" variant="contained" onClick={onConfirm} disabled={!reason.trim()}>Stage {selection.kind} deletion</Button></DialogActions>
  </Dialog>;
}
