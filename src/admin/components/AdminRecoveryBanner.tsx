import { Alert, Button } from '@mui/material';
export function AdminRecoveryBanner({ busy, onSignIn }: { busy: boolean; onSignIn: () => void }) {
  return (
    <Alert
      severity="warning"
      action={
        <Button color="inherit" disabled={busy} onClick={onSignIn}>
          Sign in to continue
        </Button>
      }
    >
      Sign in to continue. Your entered text is kept.
    </Alert>
  );
}
