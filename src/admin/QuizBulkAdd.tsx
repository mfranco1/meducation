import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { bulkAddTemplate, compileBulkAddDraft, type BulkAddContext } from './core/bulkAddDraft';
import { errorMessages } from './data/PairedHttpClient';
import type { DraftStore } from './data/DraftStore';
import { useAdminConfirmation } from './useAdminConfirmation';

export type BulkTarget =
  | { kind: 'newSubject' }
  | { kind: 'subject'; subjectId?: string }
  | { kind: 'quiz'; subjectId?: string; quizId?: string };

const contextOf = (target: BulkTarget): BulkAddContext | undefined =>
  target.kind === 'newSubject'
    ? target
    : target.kind === 'subject'
      ? target.subjectId
        ? { kind: 'subject', subjectId: target.subjectId }
        : undefined
      : target.subjectId && target.quizId
        ? { kind: 'quiz', subjectId: target.subjectId, quizId: target.quizId }
        : undefined;

/** Content-only JSON for new subjects, quizzes and questions. Save creates parents first, then the questions. */
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
  onAdded: (where: { subjectId?: string; quizId?: string }) => void;
}) {
  const bank = store.quizBank;
  const context = contextOf(target);
  const template = useMemo(() => (context ? JSON.stringify(bulkAddTemplate(context), null, 2) : ''), [context]);
  const [text, setText] = useState(template);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState<string>();
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
  const subject = bank.subjects.find((row) => row.id === (target.kind === 'newSubject' ? undefined : target.subjectId));
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
        subjectId: result.subjectId ?? (context.kind === 'newSubject' ? undefined : context.subjectId),
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
        onChange={(event) => void retarget({ kind: event.target.value as BulkTarget['kind'] })}
        fullWidth
      >
        <MenuItem value="newSubject">Create a subject and quizzes</MenuItem>
        <MenuItem value="subject">Add quizzes to a subject</MenuItem>
        <MenuItem value="quiz">Add items to a quiz</MenuItem>
      </TextField>
      {target.kind !== 'newSubject' && (
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
            setQuizQuery(undefined);
            void retarget({ kind: target.kind, subjectId: row?.id });
          }}
          renderInput={(params) => <TextField {...params} label="Subject" />}
        />
      )}
      {target.kind === 'quiz' && (
        <Autocomplete
          inputValue={quizQuery ?? (quiz ? `${quiz.name} · ${quiz.id}` : '')}
          onInputChange={(_, value, reason) => {
            if (reason === 'input') setQuizQuery(value);
          }}
          options={bank.quizzes.filter((row) => row.subjectId === target.subjectId)}
          value={quiz ?? null}
          disabled={!target.subjectId}
          getOptionLabel={(row) => `${row.name} · ${row.id}`}
          isOptionEqualToValue={(left, right) => left.id === right.id}
          onChange={(_, row) => {
            setQuizQuery(undefined);
            void retarget({ kind: 'quiz', subjectId: target.subjectId, quizId: row?.id });
          }}
          renderInput={(params) => <TextField {...params} label="Quiz" />}
        />
      )}
      <Typography variant="body2">
        Destination ·{' '}
        {target.kind === 'newSubject'
          ? 'New subject'
          : target.kind === 'subject'
            ? (subject?.name ?? 'Choose a subject')
            : subject && quiz
              ? `${subject.name} / ${quiz.name}`
              : 'Choose a subject and quiz'}
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
        placeholder={context ? 'Edit subject, quiz, and item content.' : 'Choose a destination first.'}
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
