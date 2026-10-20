import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { DraftQuizBank, StoredRecord } from '../data/DraftStore';
import { selectQuizNavigatorPage } from '../core/navigator';
import type { Selection } from '../useRecordEditor';
import { AdminRecordSelection, useAdminRecordSelection } from './AdminRecordSelection';

import { AdminParentActions } from './AdminParentActions';

export const adminNavigatorLayout = { width: { xs: '100%', lg: 320 }, flexShrink: 0, minWidth: 0 };

interface Props {
  disabled?: boolean;
  bank: DraftQuizBank;
  selection: Selection;
  selectedSubjectId?: string;
  selectedTopicId?: string;
  selectedQuizId?: string;
  filter: string;
  setFilter: (value: string) => void;
  loadEntity: (selection: Selection, record: StoredRecord) => void;
  chooseBulkTarget?: (kind: 'topic' | 'quiz', context: { subjectId: string; topicId: string; quizId?: string }) => void;
  onNewTopic: (subjectId: string) => void;
  onManageSubjects: (id?: string) => void;
  onDeleteMany?: (kind: 'topic' | 'quiz' | 'question', parentId: string, ids: string[]) => void;
  onBrowseChange?: (subjectId: string, topicId?: string, quizId?: string) => boolean | Promise<boolean>;
  onDelete?: (selection: Selection, label: string) => void;
}

export function AdminNavigatorPanel({
  disabled = false,
  bank,
  selection,
  selectedSubjectId,
  selectedTopicId,
  selectedQuizId,
  filter,
  setFilter,
  loadEntity,
  chooseBulkTarget,
  onDelete,
  onBrowseChange,
  onDeleteMany,
  onNewTopic,
  onManageSubjects,
}: Props) {
  const [subjectId, setSubjectId] = useState(selectedSubjectId ?? '');
  const [topicId, setTopicId] = useState(selectedTopicId ?? '');
  const [quizId, setQuizId] = useState(selectedQuizId ?? '');
  const [subjectQuery, setSubjectQuery] = useState<string>();
  const [topicQuery, setTopicQuery] = useState<string>();
  const [quizQuery, setQuizQuery] = useState<string>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    setSubjectId(selectedSubjectId ?? '');
    setTopicId(selectedTopicId ?? '');
    setQuizId(selectedQuizId ?? '');
    setPage(0);
  }, [selectedSubjectId, selectedTopicId, selectedQuizId]);

  const subject = bank.subjects.find((item) => item.id === subjectId) ?? null;
  const topics = useMemo(() => bank.topics.filter((topic) => topic.subjectId === subjectId), [bank.topics, subjectId]);
  const topic = topics.find((item) => item.id === topicId) ?? null;
  const quizzes = useMemo(() => bank.quizzes.filter((quiz) => quiz.topicId === topicId), [bank.quizzes, topicId]);
  const quiz = quizzes.find((item) => item.id === quizId) ?? null;
  const results = useMemo(
    () => selectQuizNavigatorPage(bank, topicId || undefined, quizId || undefined, filter, page),
    [bank, topicId, quizId, filter, page],
  );
  const changeSubject = async (id: string) => {
    if (onBrowseChange && !(await onBrowseChange(id))) return;
    setSubjectId(id);
    setTopicId('');
    setQuizId('');
    setFilter('');
    setPage(0);
  };
  const changeTopic = async (id: string) => {
    if (onBrowseChange && !(await onBrowseChange(subjectId, id))) return;
    setTopicId(id);
    setQuizId('');
    setFilter('');
    setPage(0);
  };
  const changeQuiz = async (id: string) => {
    if (onBrowseChange && !(await onBrowseChange(subjectId, topicId, id))) return;
    setQuizId(id);
    setFilter('');
    setPage(0);
  };
  const listKind = quiz ? 'question' : topic ? 'quiz' : subject ? 'topic' : undefined;
  const listParentId = quiz ? quiz.id : topic ? topic.id : subjectId;
  const questionCounts = (id: string) => bank.questions.filter((row) => row.quizId === id).length;
  const listRows = quiz
    ? []
    : topic
      ? quizzes.map((row) => ({ id: row.id, primary: row.name, secondary: `${questionCounts(row.id)} items`, open: changeQuiz }))
      : topics.map((row) => ({ id: row.id, primary: row.name, secondary: row.id, open: changeTopic }));
  const allIds = quiz ? bank.questions.filter((row) => row.quizId === quizId).map((row) => row.id) : listRows.map((row) => row.id);
  const recordSelection = useAdminRecordSelection(JSON.stringify([subjectId, topicId, quizId, filter]), allIds);
  return (
    <Paper component="section" aria-label="Quiz navigator" variant="outlined" sx={{ ...adminNavigatorLayout, p: 2 }}>
      <Stack component="fieldset" disabled={disabled} spacing={1} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        <Autocomplete
          inputValue={subjectQuery ?? (subject ? `${subject.name} · ${subject.id}` : '')}
          onInputChange={(_, value, reason) => {
            if (reason === 'input') setSubjectQuery(value);
          }}
          options={[...bank.subjects]}
          value={subject}
          getOptionLabel={(item) => `${item.name} · ${item.id}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => {
            changeSubject(value?.id ?? '');
            setSubjectQuery(undefined);
            setTopicQuery(undefined);
            setQuizQuery(undefined);
          }}
          renderInput={(params) => <TextField {...params} label="Subject" size="small" />}
        />
        <Button size="small" color="inherit" onClick={() => onManageSubjects(subject?.id)}>
          Manage subjects…
        </Button>
        {subject && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" onClick={() => onNewTopic(subject.id)}>
              New topic
            </Button>
            <AdminParentActions
              entity="Subject"
              onEdit={() => onManageSubjects(subject.id)}
              onDelete={() => onDelete?.({ kind: 'subject', id: subject.id }, subject.name)}
            />
          </Stack>
        )}
        {subject && (
          <Autocomplete
            inputValue={topicQuery ?? (topic ? `${topic.name} · ${topic.id}` : '')}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') setTopicQuery(value);
            }}
            options={topics}
            value={topic}
            getOptionLabel={(item) => `${item.name} · ${item.id}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, value) => {
              changeTopic(value?.id ?? '');
              setTopicQuery(undefined);
              setQuizQuery(undefined);
            }}
            renderInput={(params) => <TextField {...params} label="Topic" size="small" />}
          />
        )}
        {subject && topic && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              onClick={() => chooseBulkTarget?.('topic', { subjectId: subject.id, topicId: topic.id })}
            >
              Add quizzes
            </Button>
            <AdminParentActions
              entity="Topic"
              onEdit={() => loadEntity({ kind: 'topic', id: topic.id, parentId: subject.id }, topic)}
              onDelete={() => onDelete?.({ kind: 'topic', id: topic.id, parentId: subject.id }, topic.name)}
            />
          </Stack>
        )}
        {topic && (
          <Autocomplete
            inputValue={quizQuery ?? (quiz ? `${quiz.name} · ${quiz.id}` : '')}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') setQuizQuery(value);
            }}
            options={quizzes}
            value={quiz}
            getOptionLabel={(item) => `${item.name} · ${item.id}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, value) => {
              changeQuiz(value?.id ?? '');
              setQuizQuery(undefined);
            }}
            renderInput={(params) => <TextField {...params} label="Quiz" size="small" />}
          />
        )}
        {!subject && (
          <Stack direction="row">
            <Button size="small" onClick={() => onManageSubjects()}>Add subject</Button>
          </Stack>
        )}
        {subject && topic && quiz && (
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              onClick={() => chooseBulkTarget?.('quiz', { subjectId: subject.id, topicId: topic.id, quizId: quiz.id })}
            >
              Add questions
            </Button>
            <AdminParentActions
              entity="Quiz"
              onEdit={() => loadEntity({ kind: 'quiz', id: quiz.id, parentId: topic.id }, quiz)}
              onDelete={() => onDelete?.({ kind: 'quiz', id: quiz.id, parentId: topic.id }, quiz.name)}
            />
          </Stack>
        )}
        {quiz && (
          <TextField
            label="Search items in this quiz"
            value={filter}
            size="small"
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
        )}
        {quiz && (
          <Typography variant="caption" aria-live="polite">
            {filter ? `${results.matches.length} matches` : `${results.matches.length} items`} · {quiz.name}
          </Typography>
        )}
        {listKind && onDeleteMany && (
          <AdminRecordSelection
            selection={recordSelection}
            pageIds={quiz ? results.visible.map(({ question }) => question.id) : allIds}
            onDelete={(ids) => onDeleteMany(listKind, listParentId, ids)}
          />
        )}
        <Box
          component="nav"
          aria-label={
            quiz ? `Items in ${quiz.name}` : topic ? `Quizzes in ${topic.name}` : subject ? `Topics in ${subject.name}` : 'Navigator list'
          }
          sx={{ overflowY: 'auto', maxHeight: { xs: '40dvh', lg: '50vh' } }}
        >
          {quiz ? (
            <List dense disablePadding>
              {results.visible.map(({ question, position }) => (
                <Stack component="li" key={question.id} direction="row" alignItems="center">
                  {recordSelection.enabled && (
                    <Checkbox
                      size="small"
                      checked={recordSelection.ids.includes(question.id)}
                      onChange={() => recordSelection.toggle(question.id)}
                      slotProps={{ input: { 'aria-label': `Select item ${question.id}` } }}
                    />
                  )}
                  <ListItemButton
                    selected={selection.kind === 'question' && selection.id === question.id}
                    onClick={() => loadEntity({ kind: 'question', id: question.id, parentId: quiz.id }, question)}
                    sx={{ borderRadius: '10px', mx: 0.5, width: 'calc(100% - 8px)' }}
                  >
                    <ListItemText
                      primary={`${position}. ${question.id}`}
                      secondary={question.stem}
                      secondaryTypographyProps={{
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
            </List>
          ) : listRows.length ? (
            <List dense disablePadding>
              {listRows.map((row) => (
                <Stack component="li" key={row.id} direction="row" alignItems="center">
                  {recordSelection.enabled && (
                    <Checkbox
                      size="small"
                      checked={recordSelection.ids.includes(row.id)}
                      onChange={() => recordSelection.toggle(row.id)}
                      slotProps={{ input: { 'aria-label': `Select ${listKind} ${row.id}` } }}
                    />
                  )}
                  <ListItemButton
                    onClick={() => void row.open(row.id)}
                    sx={{ borderRadius: '10px', mx: 0.5, width: 'calc(100% - 8px)' }}
                  >
                    <ListItemText primary={row.primary} secondary={row.secondary} />
                  </ListItemButton>
                </Stack>
              ))}
            </List>
          ) : subject && !topics.length ? (
            <Typography variant="body2" sx={{ p: 1 }}>
              No topics in this subject.
            </Typography>
          ) : topic && !quizzes.length ? (
            <Typography variant="body2" sx={{ p: 1 }}>
              No quizzes in this topic.
            </Typography>
          ) : null}
          {quiz && !results.matches.length && (
            <Typography variant="body2" sx={{ p: 1 }}>
              {filter ? 'No matching items.' : 'No items in this quiz.'}
            </Typography>
          )}
        </Box>
        {quiz && results.matches.length > 0 && (
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption">
              {results.rangeStart}–{results.rangeEnd} of {results.matches.length}
            </Typography>
            {results.pageCount > 1 && (
              <Stack direction="row">
                <Button
                  size="small"
                  disabled={!results.page}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  disabled={results.page + 1 >= results.pageCount}
                  onClick={() => setPage((value) => Math.min(results.pageCount - 1, value + 1))}
                >
                  Next
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
