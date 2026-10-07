import { Button, Stack, Typography } from '@mui/material';
import { ContentLoadError } from '../../../content/api/contentTransport';
import { contentLoadMessage } from './notificationMessages';

export function ContentLoadFailure({ title, error, onRetry }: { title: string; error?: Error; onRetry: () => void }) {
  const revisionConflict = error instanceof ContentLoadError && error.kind === 'revision';
  return <Stack role="alert" spacing={0.5} alignItems="flex-start" sx={{ py: 1 }}>
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{title.replace(/^Failed to load/, 'Unable to load')}</Typography>
    <Typography color="text.secondary" variant="body2">{contentLoadMessage(error)}</Typography>
    <Button variant="text" size="small" onClick={onRetry} sx={{ minHeight: 44, minWidth: 44, px: 0.5, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
      {revisionConflict ? 'Reload content' : 'Retry'}
    </Button>
  </Stack>;
}
