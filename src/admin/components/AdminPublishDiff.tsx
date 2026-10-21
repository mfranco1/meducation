import { useEffect, useState } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { DiffStatus, DraftDiff, DraftStore, Fields } from '../data/DraftStore';
import { diffWords } from '../core/textDiff';
import { LABEL, name } from './AdminChangesDialog';

const STATUS: Record<DiffStatus, string> = { added: 'Added', changed: 'Changed', moved: 'Moved', removed: 'Removed' };
const text = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

function FieldDiff({ before, after }: { before: Fields | null; after: Fields | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
    (key) => key !== 'id' && text(before?.[key]) !== text(after?.[key]),
  );
  if (!keys.length) return <Typography variant="body2">Order changed. The content is the same.</Typography>;
  return (
    <Stack spacing={1}>
      {keys.map((key) => (
        <Box key={key}>
          <Typography variant="caption" color="text.secondary">
            {key}
          </Typography>
          <Box
            component="pre"
            sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', typography: 'body2' }}
          >
            {diffWords(text(before?.[key]), text(after?.[key])).map((part, index) =>
              part.change === 'added' ? (
                <Box
                  component="ins"
                  key={index}
                  sx={(theme) => ({ bgcolor: theme.palette.feedback.correct.surface, textDecoration: 'none' })}
                >
                  {part.text}
                </Box>
              ) : part.change === 'removed' ? (
                <Box component="del" key={index} sx={(theme) => ({ bgcolor: theme.palette.feedback.incorrect.surface })}>
                  {part.text}
                </Box>
              ) : (
                part.text
              ),
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

/** What publishing changes for learners: each record that differs from the published version. */
export function AdminPublishDiff({ store }: { store: Pick<DraftStore, 'diff'> }) {
  const [diff, setDiff] = useState<DraftDiff>();
  const [problem, setProblem] = useState('');
  useEffect(() => {
    let active = true;
    store.diff().then(
      (value) => active && setDiff(value),
      (error) => active && setProblem(error instanceof Error ? error.message : 'Unable to load the changes.'),
    );
    return () => {
      active = false;
    };
  }, [store]);
  if (problem) return <Alert severity="error">{problem}</Alert>;
  if (!diff) return <Typography variant="body2">Loading changes…</Typography>;
  if (!diff.entries.length)
    return <Alert severity="info">The draft matches the published version.</Alert>;
  const totals = Object.entries(diff.totals).map(
    ([kind, statuses]) =>
      `${kind}: ${Object.entries(statuses)
        .map(([status, count]) => `${count} ${status}`)
        .join(', ')}`,
  );
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" aria-label="Change totals">
        {totals.join(' · ')}
      </Typography>
      {diff.truncated && (
        <Alert severity="info">Showing the first {diff.entries.length} changes. The totals include all of them.</Alert>
      )}
      <Stack spacing={1} aria-label="Changed records">
        {diff.entries.map((entry) => (
          <Box
            component="details"
            key={`${entry.kind}/${entry.id}`}
            open={entry.status === 'changed'}
            sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}
          >
            <Box component="summary" sx={{ cursor: 'pointer', overflowWrap: 'anywhere', typography: 'body2' }}>
              {`${STATUS[entry.status]} ${LABEL[entry.kind]} ${entry.id}${name(entry) ? ' · ' + name(entry) : ''}`}
            </Box>
            <Box sx={{ pt: 1, pl: 2 }}>
              <FieldDiff before={entry.before} after={entry.after} />
            </Box>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
