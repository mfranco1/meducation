import { useEffect, useState } from 'react';
import { Alert, Button, Container, Stack } from '@mui/material';
import { PairedHttpClient } from './data/PairedHttpClient';
export function SessionCompletion() {
  const [message, setMessage] = useState('Checking sign-in result…');
  useEffect(() => {
    void new PairedHttpClient()
      .refreshSession()
      .then((status) => {
        setMessage(
          status.authenticated
            ? 'Sign-in flow finished. Return to the editor and review again.'
            : 'Sign-in was canceled or did not complete. Your editor text is kept.',
        );
        window.opener?.postMessage('meducation-admin-auth-complete', location.origin);
      })
      .catch(() => setMessage('Unable to check sign-in. Close this window and refresh session in the editor.'));
  }, []);
  return (
    <Container sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Alert severity="info">{message}</Alert>
        <Button onClick={() => window.close()}>Return to editor</Button>
      </Stack>
    </Container>
  );
}
