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
      {kind === 'subject' || kind === 'quiz' || kind === 'deck' ? (
        <Typography variant="h6">{String(record.name)}</Typography>
      ) : null}
      {kind === 'subject' && note('Accent', record.accent)}
      {kind === 'deck' && record.description !== undefined && note('Description', record.description)}
      {kind === 'card' && (
        <>
          {rich('Front', String(record.front))}
          {rich('Back', String(record.back))}
          {record.sources !== undefined && restricted('Sources', String(record.sources))}
          {note('Review note', record.reviewNote)}
        </>
      )}
      {kind === 'question' && (
        <>
          {rich('Question stem', String(record.stem))}
          {(record.choices as DraftChoice[]).map((choice, index) => (
            <Box key={index}>{restricted(`Choice ${choice.id}`, choice.text)}</Box>
          ))}
          {note('Source answer', record.answer ?? 'Not provided')}
          {note('Verified answer', record.verifiedAnswer ?? 'Not set')}
          {note('Runtime answer', record.verifiedAnswer ?? record.answer ?? 'Unavailable')}
          {note('Answer note', record.answerNote)}
          {meta?.answerReviewNote !== undefined && note('Answer under review', meta.answerReviewNote)}
          {rich('Rationale', String(record.rationale))}
          {meta?.sources !== undefined && restricted('Sources', String(meta.sources))}
          {Object.entries((record.choiceExplanations ?? {}) as Record<string, string>).map(([id, text]) => (
            <Box key={id}>{restricted(`Explanation for choice ${id}`, text)}</Box>
          ))}
          {(record.pearls as string[] | undefined)?.map((pearl, index) => (
            <Box key={index}>{note('Pearl', pearl)}</Box>
          ))}
        </>
      )}
    </Stack>
  );
}
