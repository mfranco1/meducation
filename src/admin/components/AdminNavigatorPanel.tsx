import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, List, ListItemButton, ListItemText, Menu, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { selectQuizNavigatorPage } from '../core/quizNavigator';
import type { EntityKind, Selection } from '../useAdminEditor';
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
  onDelete?: (selection: Selection, label: string) => void;
}

export function AdminNavigatorPanel({ bank, selection, selectedSubjectId, selectedQuizId, filter, setFilter, loadEntity, loadNew, onDelete }: Props) {
  const [subjectId, setSubjectId] = useState(selectedSubjectId ?? '');
  const [quizId, setQuizId] = useState(selectedQuizId ?? '');
  const [page, setPage] = useState(0);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);
  const [itemActionsAnchor, setItemActionsAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (selectedSubjectId && selectedSubjectId !== subjectId) setSubjectId(selectedSubjectId);
    if (!selectedSubjectId && selection.kind === 'subject' && selection.id !== subjectId) setSubjectId(selection.id ?? '');
    if (selectedQuizId && selectedQuizId !== quizId) setQuizId(selectedQuizId);
  }, [selectedSubjectId, selectedQuizId, selection.kind, selection.id, subjectId, quizId]);

  const subject = bank.subjects.find((item) => item.id === subjectId) ?? null;
  const quizzes = useMemo(() => bank.quizzes.filter((quiz) => quiz.subjectId === subjectId), [bank.quizzes, subjectId]);
  const quiz = quizzes.find((item) => item.id === quizId) ?? null;
  const results = useMemo(() => selectQuizNavigatorPage(bank, subjectId || undefined, quizId || undefined, filter, page), [bank, subjectId, quizId, filter, page]);
  const changeSubject = (id: string) => { setSubjectId(id); setQuizId(''); setFilter(''); setPage(0); };
  const changeQuiz = (id: string) => { setQuizId(id); setFilter(''); setPage(0); };
  return <Paper variant="outlined" sx={{ width: { lg: 320 }, p: 2, maxHeight: { xs: '40dvh', lg: '78vh' }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      <Autocomplete options={[...bank.subjects]} value={subject} getOptionLabel={(item) => `${item.name} · ${item.id}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, value) => changeSubject(value?.id ?? '')} renderInput={(params) => <TextField {...params} label="Subject" size="small" />} />
      {subject && <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" aria-haspopup="menu" onClick={(event) => setActionsAnchor(event.currentTarget)}>Subject actions</Button>
        <Menu anchorEl={actionsAnchor} open={Boolean(actionsAnchor)} onClose={() => setActionsAnchor(null)}>
          <MenuItem onClick={() => { setActionsAnchor(null); loadEntity({ kind: 'subject', id: subject.id }, subject); }}>Edit subject</MenuItem>
          <MenuItem onClick={() => { setActionsAnchor(null); onDelete?.({ kind: 'subject', id: subject.id }, subject.name); }}>Delete subject…</MenuItem>
        </Menu>
        <Button size="small" aria-haspopup="menu" onClick={(event) => setAddAnchor(event.currentTarget)}>Add</Button>
        <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
          <MenuItem onClick={() => { setAddAnchor(null); loadNew('quiz'); }}>Add quiz</MenuItem>
          <MenuItem disabled={!quiz} onClick={() => { setAddAnchor(null); loadNew('question'); }}>Add item</MenuItem>
        </Menu>
      </Stack>}
      {subject && <Autocomplete options={quizzes} value={quiz} getOptionLabel={(item) => `${item.name} · ${item.id}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, value) => changeQuiz(value?.id ?? '')} renderInput={(params) => <TextField {...params} label="Quiz" size="small" />} />}
      {!subject && <Stack direction="row"><AdminAddSubjectButton onClick={() => loadNew('subject')} /></Stack>}
      {quiz && <Stack direction="row" spacing={1}>
        <Button size="small" aria-haspopup="menu" onClick={(event) => setItemActionsAnchor(event.currentTarget)}>Quiz actions</Button>
        <Menu anchorEl={itemActionsAnchor} open={Boolean(itemActionsAnchor)} onClose={() => setItemActionsAnchor(null)}>
          <MenuItem onClick={() => { setItemActionsAnchor(null); loadEntity({ kind: 'quiz', id: quiz.id, parentId: subject!.id }, quiz); }}>Edit quiz</MenuItem>
          <MenuItem onClick={() => { setItemActionsAnchor(null); onDelete?.({ kind: 'quiz', id: quiz.id, parentId: subject!.id }, quiz.name); }}>Delete quiz…</MenuItem>
        </Menu>
        <Button size="small" onClick={() => loadNew('question')}>Add item</Button>
      </Stack>}
      {quiz && <TextField label="Search items in this quiz" value={filter} size="small" onChange={(event) => { setFilter(event.target.value); setPage(0); }} />}
      {quiz && <Typography variant="caption" aria-live="polite">{filter ? `${results.matches.length} matches` : `${results.matches.length} items`} · {quiz.name}</Typography>}
      <Box component="nav" aria-label={quiz ? `Items in ${quiz.name}` : 'Quizzes in selected subject'} sx={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {quiz ? <List dense disablePadding>{results.visible.map(({ question, position }) => <ListItemButton key={question.id} selected={selection.kind === 'question' && selection.id === question.id} onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: quiz.id }, question)} sx={{ borderRadius: '10px', mx: .5, width: 'calc(100% - 8px)' }}><ListItemText primary={`${position}. ${question.id}`} secondary={question.stem} secondaryTypographyProps={{ sx: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }} /></ListItemButton>)}</List>
          : subject ? <Typography variant="body2" sx={{ p: 1 }}>{quizzes.length ? 'Choose a quiz to browse its items.' : 'No quizzes in this subject.'}</Typography> : null}
        {quiz && !results.matches.length && <Typography variant="body2" sx={{ p: 1 }}>{filter ? 'No matching items.' : 'No items in this quiz.'}</Typography>}
      </Box>
      {quiz && results.matches.length > 0 && <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption">{results.rangeStart}–{results.rangeEnd} of {results.matches.length}</Typography>{results.pageCount > 1 && <Stack direction="row"><Button size="small" disabled={!results.page} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><Button size="small" disabled={results.page + 1 >= results.pageCount} onClick={() => setPage((value) => Math.min(results.pageCount - 1, value + 1))}>Next</Button></Stack>}</Stack>}
    </Stack>
  </Paper>;
}
