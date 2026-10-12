import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { selectQuizNavigatorPage } from '../core/quizNavigator';
import type { EntityKind, Selection } from '../useAdminEditor';
import { AdminRecordSelection, useAdminRecordSelection } from './AdminRecordSelection';
import { adminNavigatorLayout } from './adminPanelLayout';
import { AdminAddSubjectButton } from './AdminAddSubjectButton';

interface Props {
  bank: StoredQuestionBank;
  selection: Selection;
  selectedSubjectId?: string;
  selectedQuizId?: string;
  filter: string;
  setFilter: (value: string) => void;
  loadEntity: (selection: Selection, value: unknown) => void;
  loadNew: (kind: EntityKind) => void;
  chooseBulkTarget?: (kind: 'subject' | 'quiz', context?: { subjectId?: string; quizId?: string }) => void;
  onDeleteItems?: (ids: string[]) => void;
  onBrowseChange?: (subjectId: string, quizId?: string) => boolean;
  onDelete?: (selection: Selection, label: string) => void;
}

export function AdminNavigatorPanel({ bank, selection, selectedSubjectId, selectedQuizId, filter, setFilter, loadEntity, loadNew, chooseBulkTarget, onDelete, onBrowseChange, onDeleteItems }: Props) {
  const [subjectId, setSubjectId] = useState(selectedSubjectId ?? '');
  const [quizId, setQuizId] = useState(selectedQuizId ?? '');
  const [subjectQuery, setSubjectQuery] = useState<string>();
  const [quizQuery, setQuizQuery] = useState<string>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    setSubjectId(selectedSubjectId ?? '');
    setQuizId(selectedQuizId ?? '');
    setPage(0);
  }, [selectedSubjectId, selectedQuizId]);

  const subject = bank.subjects.find((item) => item.id === subjectId) ?? null;
  const quizzes = useMemo(() => bank.quizzes.filter((quiz) => quiz.subjectId === subjectId), [bank.quizzes, subjectId]);
  const quiz = quizzes.find((item) => item.id === quizId) ?? null;
  const results = useMemo(() => selectQuizNavigatorPage(bank, subjectId || undefined, quizId || undefined, filter, page), [bank, subjectId, quizId, filter, page]);
  const recordSelection = useAdminRecordSelection(JSON.stringify([subjectId, quizId, filter]), bank.questions.filter(row => row.quizId === quizId).map(row => row.id));
  const changeSubject = (id: string) => { if (onBrowseChange && !onBrowseChange(id)) return; setSubjectId(id); setQuizId(''); setFilter(''); setPage(0); };
  const changeQuiz = (id: string) => { if (onBrowseChange && !onBrowseChange(subjectId, id)) return; setQuizId(id); setFilter(''); setPage(0); };
  return <Paper component="section" aria-label="Quiz navigator" variant="outlined" sx={{ ...adminNavigatorLayout, p: 2 }}>
    <Stack spacing={1}>
      <Autocomplete inputValue={subjectQuery ?? (subject ? `${subject.name} · ${subject.id}` : '')} onInputChange={(_, value, reason) => { if (reason === 'input') setSubjectQuery(value); }} options={[...bank.subjects]} value={subject} getOptionLabel={(item) => `${item.name} · ${item.id}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, value) => { changeSubject(value?.id ?? ''); setSubjectQuery(undefined); setQuizQuery(undefined); }} renderInput={(params) => <TextField {...params} label="Subject" size="small" />} />
      {subject && <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" onClick={() => chooseBulkTarget?.('subject', { subjectId: subject.id })}>Add</Button>
        <Button size="small" onClick={() => loadEntity({ kind: 'subject', id: subject.id }, subject)}>Edit</Button>
        <Button size="small" color="error" onClick={() => onDelete?.({ kind: 'subject', id: subject.id }, subject.name)}>Delete</Button>
      </Stack>}
      {subject && <Autocomplete inputValue={quizQuery ?? (quiz ? `${quiz.name} · ${quiz.id}` : '')} onInputChange={(_, value, reason) => { if (reason === 'input') setQuizQuery(value); }} options={quizzes} value={quiz} getOptionLabel={(item) => `${item.name} · ${item.id}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, value) => { changeQuiz(value?.id ?? ''); setQuizQuery(undefined); }} renderInput={(params) => <TextField {...params} label="Quiz" size="small" />} />}
      {!subject && <Stack direction="row"><AdminAddSubjectButton onClick={() => loadNew('subject')} /></Stack>}
      {quiz && <Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => chooseBulkTarget?.('quiz', { subjectId: subject!.id, quizId: quiz.id })}>Add</Button>
        <Button size="small" onClick={() => loadEntity({ kind: 'quiz', id: quiz.id, parentId: subject!.id }, quiz)}>Edit</Button>
        <Button size="small" color="error" onClick={() => onDelete?.({ kind: 'quiz', id: quiz.id, parentId: subject!.id }, quiz.name)}>Delete</Button>
      </Stack>}
      {quiz && <TextField label="Search items in this quiz" value={filter} size="small" onChange={(event) => { setFilter(event.target.value); setPage(0); }} />}
      {quiz && <Typography variant="caption" aria-live="polite">{filter ? `${results.matches.length} matches` : `${results.matches.length} items`} · {quiz.name}</Typography>}
      {quiz && onDeleteItems && <AdminRecordSelection selection={recordSelection} pageIds={results.visible.map(({ question }) => question.id)} onDelete={onDeleteItems} />}
      <Box component="nav" aria-label={quiz ? `Items in ${quiz.name}` : 'Quizzes in selected subject'} sx={{ overflowY: 'auto', maxHeight: { xs: '40dvh', lg: '50vh' } }}>
        {quiz ? <List dense disablePadding>{results.visible.map(({ question, position }) => <Stack component="li" key={question.id} direction="row" alignItems="center">{recordSelection.enabled && <Checkbox size="small" checked={recordSelection.ids.includes(question.id)} onChange={() => recordSelection.toggle(question.id)} slotProps={{ input: { 'aria-label': `Select item ${question.id}` } }} />}<ListItemButton selected={selection.kind === 'question' && selection.id === question.id} onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: quiz.id }, question)} sx={{ borderRadius: '10px', mx: .5, width: 'calc(100% - 8px)' }}><ListItemText primary={`${position}. ${question.id}`} secondary={question.stem} secondaryTypographyProps={{ sx: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }} /></ListItemButton></Stack>)}</List>
          : subject && !quizzes.length ? <Typography variant="body2" sx={{ p: 1 }}>No quizzes in this subject.</Typography> : null}
        {quiz && !results.matches.length && <Typography variant="body2" sx={{ p: 1 }}>{filter ? 'No matching items.' : 'No items in this quiz.'}</Typography>}
      </Box>
      {quiz && results.matches.length > 0 && <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption">{results.rangeStart}–{results.rangeEnd} of {results.matches.length}</Typography>{results.pageCount > 1 && <Stack direction="row"><Button size="small" disabled={!results.page} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button size="small" disabled={results.page + 1 >= results.pageCount} onClick={() => setPage((value) => Math.min(results.pageCount - 1, value + 1))}>Next</Button></Stack>}</Stack>}
    </Stack>
  </Paper>;
}
