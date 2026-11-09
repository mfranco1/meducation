import { Button, Stack, Typography } from '@mui/material';
import { ContentLoadError } from '../../../content/api/contentTransport';
import { contentLoadMessage } from './contentLoadMessage';
import { focusRing } from '../../theme';

export function ContentLoadFailure({ title, error, onRetry }: { title: string; error?: Error; onRetry: () => void }) {
  const revisionConflict = error instanceof ContentLoadError && error.kind === 'revision';
  const requestId = error instanceof ContentLoadError ? error.requestId : undefined;
  return (
    <Stack role="alert" spacing={0.5} sx={{ alignItems: 'flex-start', py: 1 }}>
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title.replace(/^Failed to load/, 'Unable to load')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {contentLoadMessage(error)}
      </Typography>
      {requestId && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Reference: {requestId.slice(0, 8)}
        </Typography>
      )}
      <Button
        variant="text"
        size="small"
        onClick={onRetry}
        sx={{
          minHeight: 44,
          minWidth: 44,
          px: 0.5,
          '&.Mui-focusVisible': { ...focusRing },
        }}
      >
        {revisionConflict ? 'Reload content' : 'Retry'}
      </Button>
    </Stack>
  );
}
