import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';

const sameContext = (left: readonly unknown[], right: readonly unknown[]) =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

/** One captured decision. Changed text/context and unmount always decline it. */
export function useAdminConfirmation(context: readonly unknown[]) {
  const liveContext = useRef(context);
  liveContext.current = context;
  const pending = useRef<{ context: readonly unknown[]; settle: (accepted: boolean) => void } | undefined>(undefined);
  const [message, setMessage] = useState<string>();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const settle = useCallback((accepted: boolean) => {
    const decision = pending.current;
    pending.current = undefined;
    setMessage(undefined);
    decision?.settle(accepted && sameContext(decision.context, liveContext.current));
  }, []);
  useEffect(() => {
    if (pending.current && !sameContext(pending.current.context, liveContext.current)) settle(false);
  });
  useEffect(
    () => () => {
      pending.current?.settle(false);
      pending.current = undefined;
    },
    [],
  );
  const request = (text: string): Promise<boolean> => {
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      pending.current = { context: liveContext.current, settle: resolve };
      setMessage(text);
    });
  };
  const dialog = (
    <Dialog
      open={Boolean(message)}
      onClose={() => settle(false)}
      fullWidth
      fullScreen={narrow}
      aria-labelledby="discard-edits-title"
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <DialogTitle id="discard-edits-title">Discard unsaved edits?</DialogTitle>
      <DialogContent>
        <Typography>{message}</Typography>
        <Typography sx={{ mt: 2 }}>
          This removes the affected edits from this browser. The saved database draft and published content stay as they
          are.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} autoFocus onClick={() => settle(false)}>
          Keep editing
        </Button>
        <Button color="error" onClick={() => settle(true)}>
          Discard edits
        </Button>
      </DialogActions>
    </Dialog>
  );
  return { request, dialog };
}
