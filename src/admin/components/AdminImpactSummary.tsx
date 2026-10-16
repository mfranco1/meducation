import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ServerPreview } from '../data/PairedHttpClient';

const labels: Record<string, string> = {
  subjects: 'Subjects',
  quizzes: 'Quizzes',
  questions: 'Questions',
  decks: 'Decks',
  cards: 'Cards',
};
export function AdminImpactSummary({ preview }: { preview: ServerPreview }) {
  return (
    <Stack spacing={1.5} aria-label="Server change summary">
      {Object.entries(preview.counts).map(([kind, counts]) => (
        <Box key={kind}>
          <Typography fontWeight={600}>{labels[kind] ?? kind}</Typography>
          <Typography variant="body2">
            {counts.created} added · {counts.updated} changed · {counts.deleted} removed · {counts.before} →{' '}
            {counts.after} total
          </Typography>
        </Box>
      ))}
      {preview.validation.warnings > 0 && (
        <Alert severity="warning">
          {preview.validation.warnings} validation {preview.validation.warnings === 1 ? 'warning' : 'warnings'}. Review
          editor validation before saving or publishing.
        </Alert>
      )}
      {Object.entries(preview.affectedIds).map(([kind, ids]) => (
        <Box component="details" key={kind}>
          <summary>
            {kind}: {preview.totalAffected[kind] ?? ids.length} affected records
          </summary>
          {ids.length < preview.totalAffected[kind] && (
            <Typography variant="caption">
              Showing {ids.length} of {preview.totalAffected[kind]}
            </Typography>
          )}
          <Typography
            component="pre"
            variant="caption"
            sx={{
              display: 'block',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {ids.length ? ids.join('\n') : 'None'}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
