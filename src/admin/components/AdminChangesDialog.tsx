import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { DraftChange } from '../data/DraftStore';

const PAGE = 25;
const LABEL: Record<DraftChange['kind'], string> = {
  subjects: 'subject',
  topics: 'topic',
  quizzes: 'quiz',
  questions: 'question',
  decks: 'deck',
  cards: 'card',
};
const name = (change: DraftChange) => {
  const record = (change.after ?? change.before) as { name?: string; stem?: string; front?: string } | null;
  const text = record?.name ?? record?.stem ?? record?.front ?? '';
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
};

/** Recent draft changes, newest first, each with a per-record Revert. */
export function AdminChangesDialog({
  open,
  busy,
  error,
  latestChangeId,
  publishedChangeId,
  load,
  onRevert,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  error?: string;
  /** Changes after this ID are not loaded yet; the list reloads whenever it moves. */
  latestChangeId: number;
  publishedChangeId: number | null;
  load: (since: number, limit: number) => Promise<{ changes: DraftChange[]; hasMore: boolean }>;
  onRevert: (change: DraftChange) => void;
  onClose: () => void;
}) {
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [changes, setChanges] = useState<DraftChange[]>([]);
  const [oldest, setOldest] = useState(0);
  const [problem, setProblem] = useState('');
  const generation = useRef(0);
  const fetchPage = useCallback(
    async (since: number) => {
      const token = ++generation.current;
      try {
        const page = await load(since, PAGE * 4);
        return generation.current === token ? page : undefined;
      } catch (e) {
        if (generation.current === token) setProblem(e instanceof Error ? e.message : 'Unable to load changes.');
        return undefined;
      }
    },
    [load],
  );
  useEffect(() => {
    if (!open) return;
    setProblem('');
    const since = Math.max(0, latestChangeId - PAGE);
    void fetchPage(since).then((page) => {
      if (!page) return;
      setOldest(since);
      setChanges([...page.changes].reverse());
    });
  }, [open, latestChangeId, fetchPage]);
  const older = async () => {
    const since = Math.max(0, oldest - PAGE);
    const page = await fetchPage(since);
    if (!page) return;
    setOldest(since);
    setChanges((previous) => [...previous, ...page.changes.filter((change) => change.changeId <= oldest).reverse()]);
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth fullScreen={narrow} aria-labelledby="changes-title">
      <DialogTitle id="changes-title">Changes</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Every saved edit is recorded. Revert restores one record to how it was before that change; it is recorded
            as a new change. Reverting does not publish.
          </Typography>
          {(error || problem) && <Alert severity="error">{error || problem}</Alert>}
          {!changes.length && !problem && <Alert severity="info">No changes recorded yet.</Alert>}
          <List dense disablePadding aria-label="Recent changes">
            {changes.map((change) => (
              <ListItem
                key={change.changeId}
                disableGutters
                secondaryAction={
                  <Button
                    size="small"
                    aria-label={`Revert change ${change.changeId}`}
                    disabled={busy}
                    onClick={() => onRevert(change)}
                  >
                    Revert
                  </Button>
                }
              >
                <ListItemText
                  sx={{ pr: 9, overflowWrap: 'anywhere' }}
                  primary={`${change.action} ${LABEL[change.kind]} ${change.entityId}${name(change) ? ' · ' + name(change) : ''}`}
                  secondary={`#${change.changeId} · ${new Date(change.createdAt).toLocaleString()} · ${change.actor}${
                    publishedChangeId !== null && change.changeId <= publishedChangeId ? ' · published' : ''
                  }`}
                />
              </ListItem>
            ))}
          </List>
          {oldest > 0 && (
            <Button disabled={busy} onClick={() => void older()}>
              Older changes
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
