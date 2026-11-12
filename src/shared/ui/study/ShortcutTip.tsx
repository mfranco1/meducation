import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded';
import { Alert, useMediaQuery } from '@mui/material';
import { useEffect } from 'react';

/** One-time keyboard tip, shown only with a mouse or trackpad. Pressing one of `keys` (lowercase `KeyboardEvent.key`) or closing it calls `onDone`. */
export function ShortcutTip({
  message,
  keys,
  onDone,
}: {
  message: string;
  keys: readonly string[];
  onDone: () => void;
}) {
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)', { noSsr: true });

  useEffect(() => {
    if (!finePointer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input:not([type="radio"]), textarea, select'))
      )
        return;
      if (keys.includes(event.key.toLowerCase())) onDone();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finePointer, keys, onDone]);

  if (!finePointer) return null;
  return (
    <Alert
      severity="info"
      icon={<KeyboardRoundedIcon fontSize="inherit" />}
      onClose={onDone}
      closeText="Dismiss tip"
      sx={{ mb: 2 }}
    >
      {message}
    </Alert>
  );
}
