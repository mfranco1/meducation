import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  addDraftChoice,
  moveDraftChoice,
  patchChoiceText,
  patchNestedDraft,
  patchRecordDraft,
  readRecordDraft,
  removeDraftChoice,
  type DraftChoice,
  type DraftRecord,
  type RecordKind,
} from '../core/recordDraft';
import { AdminRecordPreview } from './AdminRecordPreview';

function OptionalString({
  label,
  value,
  onChange,
  multiline = true,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  multiline?: boolean;
  options?: string[];
}) {
  return (
    <Stack spacing={1}>
      <FormControlLabel
        control={
          <Checkbox checked={value !== undefined} onChange={(_, checked) => onChange(checked ? '' : undefined)} />
        }
        label={`Include ${label}`}
      />
      {value !== undefined && (
        <TextField
          label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          fullWidth
          multiline={multiline && !options}
          minRows={multiline && !options ? 2 : undefined}
          select={Boolean(options)}
        >
          {options &&
            ['', ...new Set([...options, ...(value ? [value] : [])])].map((option) => (
              <MenuItem key={option} value={option}>
                {option || 'Choose a value'}
              </MenuItem>
            ))}
        </TextField>
      )}
    </Stack>
  );
}
function StringList({
  label,
  values,
  onChange,
}: {
  label: string;
  values?: string[];
  onChange: (values: string[] | undefined) => void;
}) {
  return (
    <Stack spacing={1}>
      <FormControlLabel
        control={
          <Checkbox checked={values !== undefined} onChange={(_, checked) => onChange(checked ? [] : undefined)} />
        }
        label={`Include ${label.toLowerCase()}`}
      />
      {values?.map((value, index) => (
        <Stack key={index} spacing={1}>
          <TextField
            label={`${label} ${index + 1}`}
            value={value}
            multiline
            fullWidth
            onChange={(event) => onChange(values.map((entry, i) => (i === index ? event.target.value : entry)))}
          />
          <Button size="small" color="inherit" onClick={() => onChange(values.filter((_, i) => i !== index))}>
            Remove {label.toLowerCase()} {index + 1}
          </Button>
        </Stack>
      ))}
      {values && (
        <Button size="small" onClick={() => onChange([...values, ''])}>
          Add {label.toLowerCase()}
        </Button>
      )}
    </Stack>
  );
}
export function AdminRecordEditor({
  kind,
  text,
  existing,
  onChange,
  expectedId,
}: {
  expectedId?: string;
  kind: RecordKind;
  text: string;
  existing: boolean;
  onChange: (text: string) => void;
}) {
  const [view, setView] = useState<'edit' | 'preview' | 'json'>('edit');
  const [choiceId, setChoiceId] = useState('');
  const [error, setError] = useState('');
  const record = readRecordDraft(text, kind);
  const active = record ? view : 'json';
  const apply = (change: () => string) => {
    try {
      const next = change();
      setError('');
      if (next !== text) onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This field could not be changed. Your draft is kept.');
    }
  };
  const patch = (field: string, value: unknown) => apply(() => patchRecordDraft(text, kind, field, value, existing));
  const nested = (field: 'metadata' | 'rationaleMeta' | 'choiceExplanations', key: string, value: unknown) =>
    apply(() => patchNestedDraft(text, field, key, value));
  const input = (field: string, label: string, multiline = false) => (
    <TextField
      label={label}
      value={record?.[field] ?? ''}
      onChange={(event) => patch(field, event.target.value)}
      fullWidth
      required
      multiline={multiline || field === 'name'}
      minRows={multiline ? 3 : undefined}
      error={typeof record?.[field] === 'string' && !(record[field] as string).trim()}
      helperText={
        typeof record?.[field] === 'string' && !(record[field] as string).trim()
          ? `${label} is required.`
          : multiline
            ? 'Edit authored source text; preview does not rewrite it.'
            : undefined
      }
    />
  );
  const optional = (field: string, label: string, multiline = true) => (
    <OptionalString
      label={label}
      value={record?.[field] as string | undefined}
      multiline={multiline}
      onChange={(value) => patch(field, value)}
    />
  );
  const nestedString = (
    field: 'metadata' | 'rationaleMeta' | 'choiceExplanations',
    key: string,
    label: string,
    options?: string[],
  ) => (
    <OptionalString
      label={label}
      value={(record?.[field] as DraftRecord | undefined)?.[key] as string | undefined}
      options={options}
      onChange={(value) => nested(field, key, value)}
    />
  );
  const choices = record?.choices as DraftChoice[] | undefined;
  return (
    <Stack spacing={2}>
      <Tabs
        value={active}
        onChange={(_, value) => {
          setError('');
          setView(value);
        }}
        aria-label="Record view"
      >
        <Tab value="edit" label="Edit" disabled={!record} />
        <Tab value="preview" label="Preview" disabled={!record} />
        <Tab value="json" label="JSON" />
      </Tabs>
      {!record && text && (
        <Alert severity="info">
          This draft cannot be shown as a form yet. Keep editing JSON; its exact text is kept. Schema validation still
          runs before saving.
        </Alert>
      )}
      {existing && expectedId && record?.id !== expectedId && (
        <Alert severity="info">Saved record ID: {expectedId}. Preserve this ID when repairing JSON.</Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {active === 'json' && (
        <>
          <Typography variant="caption" color="text.secondary">
            Advanced source editing. Preserve stable IDs and original answer keys; document intentional corrections in
            the change reason and provenance notes.
          </Typography>
          <TextField
            label="JSON"
            value={text}
            onChange={(event) => {
              setView('json');
              setError('');
              onChange(event.target.value);
            }}
            fullWidth
            multiline
            minRows={10}
            maxRows={24}
            slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
          />
        </>
      )}
      {active === 'preview' && record && <AdminRecordPreview kind={kind} record={record} />}
      {active === 'edit' && record && (
        <Stack spacing={2}>
          <TextField
            label="ID"
            value={record.id}
            slotProps={{ input: { readOnly: true } }}
            helperText={
              existing
                ? 'Stable ID · read-only'
                : 'Provisional ID · the server reserves a stable ID during save review.'
            }
          />
          {['subjectId', 'quizId', 'deckId']
            .filter((key) => record[key] !== undefined)
            .map((key) => (
              <TextField
                key={key}
                label={key === 'subjectId' ? 'Subject ID' : key === 'quizId' ? 'Quiz ID' : 'Deck ID'}
                value={record[key]}
                slotProps={{ input: { readOnly: true } }}
                helperText="Relationship · read-only in this form. Use an explicit reviewed move operation."
              />
            ))}
          {(kind === 'subject' || kind === 'quiz' || kind === 'deck') && input('name', 'Name')}
          {kind === 'subject' && input('accent', 'Accent')}
          {kind === 'deck' && optional('description', 'Description')}
          {kind === 'card' && (
            <>
              {input('front', 'Front', true)}
              {input('back', 'Back', true)}
              {optional('sources', 'Sources')}
              {optional('reviewNote', 'Review note')}
            </>
          )}
          {kind === 'question' && (
            <>
              {input('stem', 'Question stem', true)}
              <Typography variant="subtitle2">Choices · IDs stay with their authored text</Typography>
              {choices?.map((choice, index) => (
                <Stack key={index} spacing={1} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
                  <TextField
                    label={`Choice ${choice.id}`}
                    value={choice.text}
                    multiline
                    minRows={2}
                    fullWidth
                    required
                    onChange={(event) => apply(() => patchChoiceText(text, index, event.target.value))}
                  />
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                    <Button
                      size="small"
                      disabled={index === 0}
                      onClick={() => apply(() => moveDraftChoice(text, index, -1))}
                    >
                      Move choice {choice.id} up
                    </Button>
                    <Button
                      size="small"
                      disabled={index + 1 === choices.length}
                      onClick={() => apply(() => moveDraftChoice(text, index, 1))}
                    >
                      Move choice {choice.id} down
                    </Button>
                    <Button
                      size="small"
                      color="inherit"
                      disabled={
                        choices.length <= 2 ||
                        record.answer === choice.id ||
                        record.verifiedAnswer === choice.id ||
                        Object.hasOwn((record.choiceExplanations ?? {}) as object, choice.id)
                      }
                      onClick={() => apply(() => removeDraftChoice(text, index))}
                    >
                      Remove choice {choice.id}
                    </Button>
                  </Stack>
                </Stack>
              ))}
              <Typography variant="caption">
                Referenced answer choices and choices with explanations must be retained until those references are
                explicitly changed.
              </Typography>
              <Stack spacing={1}>
                <TextField
                  label="New choice ID"
                  value={choiceId}
                  onChange={(event) => setChoiceId(event.target.value)}
                />
                <Button
                  onClick={() =>
                    apply(() => {
                      const next = addDraftChoice(text, choiceId);
                      setChoiceId('');
                      return next;
                    })
                  }
                >
                  Add choice
                </Button>
              </Stack>
              {existing ? (
                <TextField
                  label="Source answer"
                  value={record.answer ?? 'Not provided'}
                  slotProps={{ input: { readOnly: true } }}
                  helperText="Original key · use verified answer for a reviewed correction."
                />
              ) : (
                <TextField
                  select
                  label="Source answer"
                  value={record.answer ?? ''}
                  onChange={(event) => patch('answer', event.target.value || undefined)}
                >
                  <MenuItem value="">Not provided</MenuItem>
                  {choices?.map((choice) => (
                    <MenuItem key={choice.id} value={choice.id}>
                      {choice.id}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                select
                label="Verified answer"
                value={record.verifiedAnswer ?? ''}
                onChange={(event) => patch('verifiedAnswer', event.target.value || undefined)}
                helperText="Runtime scoring uses the verified answer when present."
              >
                <MenuItem value="">No verified answer</MenuItem>
                {[
                  ...new Set([
                    ...(choices?.map((choice) => choice.id) ?? []),
                    ...(typeof record.verifiedAnswer === 'string' ? [record.verifiedAnswer] : []),
                  ]),
                ].map((id) => (
                  <MenuItem key={id} value={id}>
                    {id}
                  </MenuItem>
                ))}
              </TextField>
              {input('rationale', 'Rationale', true)}
              <Box component="details">
                <summary>Answer review and rationale provenance</summary>
                <Stack spacing={2} sx={{ pt: 2 }}>
                  {optional('answerNote', 'Answer note')}
                  {nestedString('rationaleMeta', 'answerReviewNote', 'Answer review note')}
                  {nestedString('rationaleMeta', 'sources', 'Sources')}
                  {nestedString('rationaleMeta', 'provenance', 'Rationale provenance', [
                    'source_migrated',
                    'ai_draft_reviewed',
                  ])}
                  {nestedString('rationaleMeta', 'reviewedAt', 'Reviewed at')}
                  {nestedString('rationaleMeta', 'reviewNote', 'Rationale review note')}
                </Stack>
              </Box>
              <Box component="details">
                <summary>Choice explanations and pearls</summary>
                <Stack spacing={2} sx={{ pt: 2 }}>
                  {[
                    ...new Set([
                      ...(choices?.map((choice) => choice.id) ?? []),
                      ...Object.keys((record.choiceExplanations ?? {}) as object),
                    ]),
                  ].map((id) => (
                    <Box key={id}>{nestedString('choiceExplanations', id, `Explanation for choice ${id}`)}</Box>
                  ))}
                  <StringList
                    label="Pearl"
                    values={record.pearls as string[] | undefined}
                    onChange={(values) => patch('pearls', values)}
                  />
                </Stack>
              </Box>
              <Box component="details">
                <summary>Classification metadata</summary>
                <Stack spacing={2} sx={{ pt: 2 }}>
                  {(['topic', 'subtopic', 'system', 'questionType'] as const).map((key) => (
                    <Box key={key}>
                      {nestedString(
                        'metadata',
                        key,
                        key === 'questionType' ? 'Question type' : key[0].toUpperCase() + key.slice(1),
                      )}
                    </Box>
                  ))}
                  {nestedString('metadata', 'difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'unknown'])}
                  <StringList
                    label="Tag"
                    values={(record.metadata as DraftRecord | undefined)?.tags as string[] | undefined}
                    onChange={(values) => nested('metadata', 'tags', values)}
                  />
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
