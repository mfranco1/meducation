import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import type { DraftFlashcardBank, DraftQuizBank, StoredRecord } from '../data/DraftStore';
import { filterTopics, selectQuizNavigatorPage, type TopicFilter } from '../core/navigator';
import type { Selection } from '../useRecordEditor';
import { AdminRecordSelection, useAdminRecordSelection } from './AdminRecordSelection';
import { AdminTopicFilter, topicTotals } from './AdminTopicFilter';
import { AdminParentActions } from './AdminParentActions';

export const adminNavigatorLayout = { width: { xs: '100%', lg: 320 }, flexShrink: 0, minWidth: 0 };

/** The bordered navigator section; its fieldset disables every control while a command runs. */
export function AdminNavigatorShell({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Paper component="section" aria-label={label} variant="outlined" sx={{ ...adminNavigatorLayout, p: 2 }}>
      <Stack component="fieldset" disabled={disabled} spacing={1} sx={{ m: 0, p: 0, border: 0, minWidth: 0 }}>
        {children}
      </Stack>
    </Paper>
  );
}

/** A subject, topic or parent picker. Typed text is dropped once the chosen value changes. */
export function AdminLevelPicker<T extends { id: string }>({
  label,
  options,
  value,
  getLabel,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  getLabel: (item: T) => string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState<string>();
  const valueId = value?.id;
  useEffect(() => setQuery(undefined), [valueId]);
  return (
    <Autocomplete
      inputValue={query ?? (value ? getLabel(value) : '')}
      onInputChange={(_, text, reason) => {
        if (reason === 'input') setQuery(text);
      }}
      options={options}
      value={value}
      getOptionLabel={getLabel}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, next) => {
        onSelect(next?.id ?? '');
        setQuery(undefined);
      }}
      renderInput={(params) => <TextField {...params} label={label} size="small" />}
    />
  );
}

export interface AdminNavRow {
  id: string;
  primary: string;
  secondary: string;
  open: () => void;
  selected?: boolean;
  /** Which line is clamped to two lines when the text is long. */
  clamp?: 'primary' | 'secondary';
}

const clampTwoLines = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

/** A named scrolling list of rows, each with an optional bulk-select checkbox. `children` render after the rows. */
export function AdminNavList({
  label,
  noun,
  rows,
  recordSelection,
  children,
}: {
  label: string;
  /** Names each checkbox: `Select ${noun} ${id}`. */
  noun: string;
  rows: readonly AdminNavRow[];
  recordSelection: ReturnType<typeof useAdminRecordSelection>;
  children?: ReactNode;
}) {
  return (
    <Box component="nav" aria-label={label} sx={{ overflowY: 'auto', maxHeight: { xs: '40dvh', lg: '50vh' } }}>
      {rows.length > 0 && (
        <List dense disablePadding>
          {rows.map((row) => (
            <Stack component="li" key={row.id} direction="row" sx={{ alignItems: 'center' }}>
              {recordSelection.enabled && (
                <Checkbox
                  size="small"
                  checked={recordSelection.ids.includes(row.id)}
                  onChange={() => recordSelection.toggle(row.id)}
                  slotProps={{ input: { 'aria-label': `Select ${noun} ${row.id}` } }}
                />
              )}
              <ListItemButton
                selected={row.selected}
                onClick={row.open}
                sx={{ borderRadius: '10px', mx: 0.5, width: 'calc(100% - 8px)' }}
              >
                <ListItemText
                  primary={row.primary}
                  secondary={row.secondary}
                  slotProps={{
                    primary: row.clamp === 'primary' ? { sx: clampTwoLines } : undefined,
                    secondary: row.clamp === 'secondary' ? { sx: clampTwoLines } : undefined,
                  }}
                />
              </ListItemButton>
            </Stack>
          ))}
        </List>
      )}
      {children}
    </Box>
  );
}

const nameAndId = (item: { id: string; name: string }) => `${item.name} · ${item.id}`;

interface Props {
  disabled?: boolean;
  bank: DraftQuizBank;
  flashcardBank: DraftFlashcardBank;
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
  flashcardBank,
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
  const [page, setPage] = useState(0);
  const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
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
  const listRows: AdminNavRow[] = quiz
    ? []
    : topic
      ? quizzes.map((row) => ({
          id: row.id,
          primary: row.name,
          secondary: `${questionCounts(row.id)} items`,
          open: () => void changeQuiz(row.id),
        }))
      : filterTopics(topics, { ...bank, ...flashcardBank }, topicFilter).map((row) => ({
          id: row.topic.id,
          primary: row.topic.name,
          secondary: `${row.topic.id} · ${topicTotals(row)}`,
          open: () => void changeTopic(row.topic.id),
        }));
  const questionRows: AdminNavRow[] = quiz
    ? results.visible.map(({ question, position }) => ({
        id: question.id,
        primary: `${position}. ${question.id}`,
        secondary: question.stem,
        clamp: 'secondary',
        selected: selection.kind === 'question' && selection.id === question.id,
        open: () => loadEntity({ kind: 'question', id: question.id, parentId: quiz.id }, question),
      }))
    : [];
  const allIds = quiz
    ? bank.questions.filter((row) => row.quizId === quizId).map((row) => row.id)
    : listRows.map((row) => row.id);
  const recordSelection = useAdminRecordSelection(JSON.stringify([subjectId, topicId, quizId, filter]), allIds);
  return (
    <AdminNavigatorShell label="Quiz navigator" disabled={disabled}>
      <AdminLevelPicker
        label="Subject"
        options={bank.subjects}
        value={subject}
        getLabel={nameAndId}
        onSelect={(id) => void changeSubject(id)}
      />
      <Button size="small" color="inherit" onClick={() => onManageSubjects(subject?.id)}>
        Manage subjects…
      </Button>
      {subject && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
        <AdminLevelPicker
          label="Topic"
          options={topics}
          value={topic}
          getLabel={nameAndId}
          onSelect={(id) => void changeTopic(id)}
        />
      )}
      {subject && topic && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
        <AdminLevelPicker
          label="Quiz"
          options={quizzes}
          value={quiz}
          getLabel={nameAndId}
          onSelect={(id) => void changeQuiz(id)}
        />
      )}
      {!subject && (
        <Stack direction="row">
          <Button size="small" onClick={() => onManageSubjects()}>
            Add subject
          </Button>
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
      {subject && !topic && topics.length > 0 && <AdminTopicFilter value={topicFilter} onChange={setTopicFilter} />}
      {listKind && onDeleteMany && (
        <AdminRecordSelection
          selection={recordSelection}
          pageIds={quiz ? results.visible.map(({ question }) => question.id) : allIds}
          onDelete={(ids) => onDeleteMany(listKind, listParentId, ids)}
        />
      )}
      <AdminNavList
        label={
          quiz
            ? `Items in ${quiz.name}`
            : topic
              ? `Quizzes in ${topic.name}`
              : subject
                ? `Topics in ${subject.name}`
                : 'Navigator list'
        }
        noun={quiz ? 'item' : (listKind ?? '')}
        rows={quiz ? questionRows : listRows}
        recordSelection={recordSelection}
      >
        {!quiz && !listRows.length && subject && !topics.length ? (
          <Typography variant="body2" sx={{ p: 1 }}>
            No topics in this subject.
          </Typography>
        ) : !quiz && !listRows.length && subject && !topic ? (
          <Typography variant="body2" sx={{ p: 1 }}>
            No topics match this filter.
          </Typography>
        ) : !quiz && !listRows.length && topic && !quizzes.length ? (
          <Typography variant="body2" sx={{ p: 1 }}>
            No quizzes in this topic.
          </Typography>
        ) : null}
        {quiz && !results.matches.length && (
          <Typography variant="body2" sx={{ p: 1 }}>
            {filter ? 'No matching items.' : 'No items in this quiz.'}
          </Typography>
        )}
      </AdminNavList>
      {quiz && results.matches.length > 0 && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption">
            {results.rangeStart}–{results.rangeEnd} of {results.matches.length}
          </Typography>
          {results.pageCount > 1 && (
            <Stack direction="row">
              <Button size="small" disabled={!results.page} onClick={() => setPage((value) => Math.max(0, value - 1))}>
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
    </AdminNavigatorShell>
  );
}
