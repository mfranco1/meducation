import { Alert, Button, Container } from '@mui/material';

export function BootFailure() {
  return <Container maxWidth="sm" sx={{ py: 6 }}>
    <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload</Button>}>
      The app could not start. Reload to try again.
    </Alert>
  </Container>;
}
