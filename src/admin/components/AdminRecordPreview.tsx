import { Box, Stack, Typography } from '@mui/material';
import { MarkdownContent } from '../../shared/ui/content/MarkdownContent';
import type { DraftChoice, DraftRecord, RecordKind } from '../core/recordDraft';

/** Uses the learner's rich/restricted renderer; preview never rewrites the draft. */
export function AdminRecordPreview({ kind, record }: { kind: RecordKind; record: DraftRecord }) {
  const rich = (label: string, text: string) => (
    <Box>
      <Typography variant="subtitle2">{label}</Typography>
      <MarkdownContent markdown={text} contentKind="rich" />
    </Box>
  );
  const restricted = (label: string, text: string) => (
    <Box>
      <Typography variant="subtitle2">{label}</Typography>
      <MarkdownContent markdown={text} />
    </Box>
  );
  const note = (label: string, value: unknown) =>
    value !== undefined ? (
      <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {label}: {String(value)}
      </Typography>
    ) : null;
  const meta = record.rationaleMeta as DraftRecord | undefined;
  return (
    <Stack spacing={2} component="section" aria-label="Rendered content preview" sx={{ overflowWrap: 'anywhere' }}>
      <Typography variant="caption">Unsaved preview · saving and publication are separate actions.</Typography>
      {kind === 'subject' || kind === 'topic' || kind === 'quiz' || kind === 'deck' ? (
        <Typography variant="h6">{String(record.name)}</Typography>
      ) : null}
      {kind === 'subject' && note('Accent', record.accent)}
      {(kind === 'subject' || kind === 'topic' || kind === 'quiz' || kind === 'deck') && note('Description', record.description)}
      {kind === 'card' && (
        <>
          {rich('Front', String(record.front))}
          {rich('Back', String(record.back))}
          {record.sources !== undefined && restricted('Sources', String(record.sources))}
        </>
      )}
      {kind === 'question' && (
        <>
          {rich('Question stem', String(record.stem))}
          {(record.choices as DraftChoice[]).map((choice, index) => (
            <Box key={index}>{restricted(`Choice ${choice.id}`, choice.text)}</Box>
          ))}
          {note('Answer', record.answer)}
          {rich('Rationale', String(record.rationale))}
          {meta?.sources !== undefined && restricted('Sources', String(meta.sources))}
          {(record.pearls as string[] | undefined)?.map((pearl, index) => (
            <Box key={index}>{note('Pearl', pearl)}</Box>
          ))}
        </>
      )}
    </Stack>
  );
}
