import { useEffect, useState } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import type { ContentLoadError } from '../../../content/contentTransport';

function useRetrySeconds(retryAt?: number) {
  const [seconds, setSeconds] = useState<number | undefined>();
  useEffect(() => {
    const update = () => setSeconds(retryAt === undefined ? undefined : Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (retryAt === undefined) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  return seconds;
}

export function ContentRecoveryBanner({ error, retrying = false, busy = false, retryAt, testId = 'content-recovery-banner', title = 'We can’t load your stats and subjects right now.', description = 'Your saved quiz history is safe. Please try again.', onRetry }: {
  error?: Error;
  retrying?: boolean;
  busy?: boolean;
  retryAt?: number;
  testId?: string;
  title?: string;
  description?: string;
  onRetry: () => void | Promise<void>;
}) {
  const [manualRetryPending, setManualRetryPending] = useState(false);
  const seconds = useRetrySeconds(retryAt);
  const reload = (error as ContentLoadError | undefined)?.kind === 'revision';
  const detail = reload ? 'Reload to continue with the latest available content.'
    : busy ? 'Retrying…' : retrying ? seconds && seconds > 0 ? `Trying again in ${seconds}s…` : 'Retrying…'
      : description;
  const disabled = busy || manualRetryPending || retrying;
  const handleRetry = () => {
    setManualRetryPending(true);
    const pending = onRetry();
    if (pending && typeof pending.then === 'function') {
      void pending.then(() => setManualRetryPending(false), () => setManualRetryPending(false));
    }
  };

  return <Box role="region" aria-label="Content recovery" data-testid={testId} sx={{ width: '100%', borderBottom: '1px solid', borderColor: 'warning.light', bgcolor: '#fff7ed' }}>
    <Container maxWidth="lg">
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.25} sx={{ py: 1.5 }}>
        <CloudOffRoundedIcon color="primary" aria-hidden="true" />
        <Typography variant="body2" sx={{ flex: 1 }}>
          <Box component="span" role="alert" sx={{ fontWeight: 800 }}>{reload ? 'Content has changed.' : title}</Box>{' '}
          <Box component="span" aria-live="off">{detail}</Box>
        </Typography>
        <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={handleRetry} disabled={disabled} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
          {reload ? 'Reload' : busy || manualRetryPending || retrying ? 'Retrying...' : 'Retry'}
        </Button>
      </Stack>
    </Container>
  </Box>;
}
