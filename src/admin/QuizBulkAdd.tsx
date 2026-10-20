import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { bulkAddTemplate, compileBulkAddDraft, type BulkAddContext } from './core/bulkAddDraft';
import { errorMessages } from './data/PairedHttpClient';
import type { DraftStore } from './data/DraftStore';
import { useAdminConfirmation } from './useAdminConfirmation';

export interface BulkTarget {
  kind: 'subject' | 'topic' | 'quiz';
  subjectId?: string;
  topicId?: string;
  quizId?: string;
}

const contextOf = ({ kind, subjectId, topicId, quizId }: BulkTarget): BulkAddContext | undefined =>
  kind === 'subject'
    ? subjectId
      ? { kind, subjectId }
      : undefined
    : kind === 'topic'
      ? topicId
        ? { kind, topicId }
        : undefined
      : topicId && quizId
        ? { kind, topicId, quizId }
        : undefined;

/** Content-only JSON for new topics, quizzes and questions. Save creates parents first, then the questions. */
export function QuizBulkAdd({
  store,
  target,
  blocked,
  onTargetChange,
  onDirtyChange,
  onAdded,
}: {
  store: DraftStore;
  target: BulkTarget;
  blocked: boolean;
  onTargetChange: (target: BulkTarget) => void;
  onDirtyChange: (dirty: boolean) => void;
  onAdded: (where: { subjectId?: string; topicId?: string; quizId?: string }) => void;
}) {
  const bank = store.quizBank;
  const context = contextOf(target);
  const template = useMemo(() => (context ? JSON.stringify(bulkAddTemplate(context), null, 2) : ''), [context]);
  const [text, setText] = useState(template);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState<string>();
  const [topicQuery, setTopicQuery] = useState<string>();
  const [quizQuery, setQuizQuery] = useState<string>();
  const dirty = text !== template;
  const confirmation = useAdminConfirmation([text, target, busy]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const targetKey = JSON.stringify(target);
  useEffect(() => {
    setText(template);
    setProblems([]);
  }, [template, targetKey]);

  const retarget = async (next: BulkTarget) => {
    if (busy || blocked || (dirty && !(await confirmation.request('Discard the unsaved batch JSON to continue?')))) return;
    setNotice('');
    onTargetChange(next);
  };
  const subject = bank.subjects.find((row) => row.id === target.subjectId);
  const topic = bank.topics.find((row) => row.id === (target.kind === 'subject' ? undefined : target.topicId));
  const quiz = bank.quizzes.find((row) => row.id === (target.kind === 'quiz' ? target.quizId : undefined));
  const save = async () => {
    if (!context) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      setProblems(['Draft JSON is invalid.']);
      return;
    }
    const compiled = compileBulkAddDraft(value, context, bank);
    if (!compiled.plan) {
      setProblems(compiled.errors);
      return;
    }
    setBusy(true);
    setProblems([]);
    setNotice('');
    const sent = text;
    try {
      const result = await store.addTree(compiled.plan);
      setNotice(`Added ${result.created} item(s) to the draft. Saving does not publish.`);
      if (sent === text) setText(template);
      onAdded({
        subjectId: target.subjectId,
        topicId: result.topicIds[0] ?? target.topicId,
        quizId: context.kind === 'quiz' ? context.quizId : result.parentIds[0],
      });
    } catch (error) {
      setProblems(errorMessages(error));
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || blocked;
  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {confirmation.dialog}
      <TextField
        select
        label="Destination"
        value={target.kind}
        onChange={(event) =>
          void retarget({ kind: event.target.value as BulkTarget['kind'], subjectId: target.subjectId })
        }
        fullWidth
      >
        <MenuItem value="subject">Create topics and quizzes</MenuItem>
        <MenuItem value="topic">Add quizzes to a topic</MenuItem>
        <MenuItem value="quiz">Add items to a quiz</MenuItem>
      </TextField>
      <Autocomplete
          inputValue={subjectQuery ?? (subject ? `${subject.name} · ${subject.id}` : '')}
          onInputChange={(_, value, reason) => {
            if (reason === 'input') setSubjectQuery(value);
          }}
          options={bank.subjects}
          value={subject ?? null}
          getOptionLabel={(row) => `${row.name} · ${row.id}`}
          isOptionEqualToValue={(left, right) => left.id === right.id}
          onChange={(_, row) => {
            setSubjectQuery(undefined);
            setTopicQuery(undefined);
            setQuizQuery(undefined);
            void retarget({ kind: target.kind, subjectId: row?.id });
          }}
          renderInput={(params) => <TextField {...params} label="Subject" />}
        />
      {target.kind !== 'subject' && (
        <Autocomplete
          inputValue={topicQuery ?? (topic ? `${topic.name} · ${topic.id}` : '')}
          onInputChange={(_, value, reason) => {
            if (reason === 'input') setTopicQuery(value);
          }}
          options={bank.topics.filter((row) => row.subjectId === target.subjectId)}
          value={topic ?? null}
          disabled={!target.subjectId}
          getOptionLabel={(row) => `${row.name} · ${row.id}`}
          isOptionEqualToValue={(left, right) => left.id === right.id}
          onChange={(_, row) => {
            setTopicQuery(undefined);
            setQuizQuery(undefined);
            void retarget({ kind: target.kind, subjectId: target.subjectId, topicId: row?.id });
          }}
          renderInput={(params) => <TextField {...params} label="Topic" />}
        />
      )}
      {target.kind === 'quiz' && (
        <Autocomplete
          inputValue={quizQuery ?? (quiz ? `${quiz.name} · ${quiz.id}` : '')}
          onInputChange={(_, value, reason) => {
            if (reason === 'input') setQuizQuery(value);
          }}
          options={bank.quizzes.filter((row) => row.topicId === target.topicId)}
          value={quiz ?? null}
          disabled={!target.topicId}
          getOptionLabel={(row) => `${row.name} · ${row.id}`}
          isOptionEqualToValue={(left, right) => left.id === right.id}
          onChange={(_, row) => {
            setQuizQuery(undefined);
            void retarget({ kind: 'quiz', subjectId: target.subjectId, topicId: target.topicId, quizId: row?.id });
          }}
          renderInput={(params) => <TextField {...params} label="Quiz" />}
        />
      )}
      <Typography variant="body2">
        Destination ·{' '}
        {!subject
          ? 'Choose a subject'
          : target.kind === 'subject'
            ? `${subject.name} / new topics`
            : !topic
              ? 'Choose a topic'
              : target.kind === 'topic'
                ? `${subject.name} / ${topic.name}`
                : quiz
                  ? `${subject.name} / ${topic.name} / ${quiz.name}`
                  : 'Choose a quiz'}
        . Up to 1,000 items per quiz. The server assigns every ID; saving does not publish.
      </Typography>
      <TextField
        label="JSON"
        slotProps={{ inputLabel: { shrink: true } }}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblems([]);
          setNotice('');
        }}
        disabled={!context}
        multiline
        minRows={16}
        maxRows={24}
        fullWidth
        InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
        placeholder={context ? 'Edit topic, quiz, and item content.' : 'Choose a destination first.'}
      />
      {problems.length > 0 && (
        <Alert severity="error">
          <Stack spacing={0.5}>
            {problems.map((line, index) => (
              <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {line}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }} aria-live="polite">
          {busy ? 'Working…' : dirty ? 'Unsaved edits' : ''}
        </Typography>
        <Button variant="contained" disabled={disabled || !context || !text.trim()} onClick={() => void save()}>
          Save
        </Button>
      </Stack>
    </Stack>
  );
}
