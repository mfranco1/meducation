import { Alert, Button, Stack } from '@mui/material';
export function AdminRecoveryBanner({
  busy,
  uncertain = true,
  onCheck,
  onSignIn,
}: {
  busy: boolean;
  uncertain?: boolean;
  onCheck: () => void;
  onSignIn?: () => void;
}) {
  return (
    <Alert
      severity="warning"
      action={
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
          {onSignIn && (
            <Button color="inherit" disabled={busy} onClick={onSignIn}>
              Sign in to continue
            </Button>
          )}
          {uncertain && (
            <Button color="inherit" disabled={busy || Boolean(onSignIn)} onClick={onCheck}>
              Check save status
            </Button>
          )}
        </Stack>
      }
    >
      {uncertain
        ? 'We could not confirm whether this saved. Check save status before another write.'
        : 'Sign in to continue. Your entered text is kept.'}
    </Alert>
  );
}
