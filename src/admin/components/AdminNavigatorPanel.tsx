import { useState } from 'react';
import { Box, Button, Divider, List, ListItemButton, ListItemText, Menu, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { StoredQuestionBank } from '../../content/schema';
import type { EntityKind, Selection } from '../useAdminEditor';

interface Props {
  bank: StoredQuestionBank;
  selection: Selection;
  selectedSubjectId?: string;
  selectedQuizId?: string;
  filter: string;
  setFilter: (value: string) => void;
  loadEntity: (selection: Selection, value: unknown) => void;
  loadNew: (kind: EntityKind) => void;
}

export function AdminNavigatorPanel({ bank, selection, selectedSubjectId, selectedQuizId, filter, setFilter, loadEntity, loadNew }: Props) {
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const selectedQuiz = bank.quizzes.find(quiz => quiz.id === selectedQuizId);
  const filteredSubjects = bank.subjects.filter(subject => `${subject.id} ${subject.name}`.toLowerCase().includes(filter.toLowerCase()));
  const visibleQuizzes = bank.quizzes.filter(quiz => quiz.subjectId === selection.parentId || quiz.subjectId === selectedSubjectId);
  const visibleQuestions = bank.questions.filter(question => question.quizId === selection.parentId || question.quizId === selectedQuizId);
  return <Paper variant="outlined" sx={{ width: { lg: 300 }, p: 2, maxHeight: { lg: '78vh' }, overflow: 'auto' }}>
    <Stack spacing={1}>
      <TextField label="Search" inputProps={{ 'aria-label': 'Search subjects' }} value={filter} onChange={event => setFilter(event.target.value)} size="small" />
      <Button size="small" aria-haspopup="menu" aria-expanded={Boolean(addMenuAnchor)} onClick={event => setAddMenuAnchor(event.currentTarget)}>Add</Button>
      <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={() => setAddMenuAnchor(null)}>
        <MenuItem onClick={() => { setAddMenuAnchor(null); loadNew('subject'); }}>Subject</MenuItem>
        <MenuItem disabled={!selectedSubjectId} onClick={() => { setAddMenuAnchor(null); loadNew('quiz'); }}>Quiz</MenuItem>
        <MenuItem disabled={!selectedQuiz} onClick={() => { setAddMenuAnchor(null); loadNew('question'); }}>Item</MenuItem>
      </Menu>
    </Stack>
    <List dense>{filteredSubjects.map(subject => <Box key={subject.id}>
      <ListItemButton selected={selection.kind === 'subject' && selection.id === subject.id} onClick={() => loadEntity({ kind: 'subject', id: subject.id }, subject)}><ListItemText primary={subject.name} secondary={`${subject.id} · ${bank.quizzes.filter(quiz => quiz.subjectId === subject.id).length} quizzes`} /></ListItemButton>
      {(selectedSubjectId === subject.id || selection.parentId === subject.id) && visibleQuizzes.map(quiz => <ListItemButton key={quiz.id} sx={{ pl: 4 }} selected={selection.kind === 'quiz' && selection.id === quiz.id} onClick={() => loadEntity({ kind: 'quiz', id: quiz.id, parentId: subject.id }, quiz)}><ListItemText primary={quiz.name} secondary={quiz.id} /></ListItemButton>)}
    </Box>)}</List>
    {selectedQuiz && <><Divider /><Typography variant="caption" sx={{ display: 'block', mt: 1 }}>{selectedQuiz.name} · {visibleQuestions.length} items</Typography><List dense>{visibleQuestions.slice(0, 200).map(question => <ListItemButton key={question.id} selected={selection.kind === 'question' && selection.id === question.id} onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: selectedQuiz.id }, question)}><ListItemText primary={question.id} secondary={question.stem.slice(0, 64)} /></ListItemButton>)}</List>{visibleQuestions.length > 200 && <Typography variant="caption">Showing first 200 of {visibleQuestions.length}; use the browser search or select a different quiz.</Typography>}</>}
  </Paper>;
}
