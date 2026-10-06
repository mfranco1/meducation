import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, AlertTitle, Button, Fade, IconButton, Stack, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export interface ToastOptions {
  id?: string;
  title?: string;
  message: ReactNode;
  severity?: ToastSeverity;
  position?: ToastPosition;
  ttlMs?: number | null;
  closeButton?: boolean;
  dismissPolicy?: 'manual' | 'automatic';
  action?: { label: string; onClick: () => void };
  scope?: { type: 'global' } | { type: 'screen'; key: string };
}
interface ToastRecord extends Required<Omit<ToastOptions, 'message' | 'ttlMs' | 'action' | 'scope'>> {
  id: string;
  message: ReactNode;
  ttlMs: number | null;
  action?: ToastOptions['action'];
  scope: NonNullable<ToastOptions['scope']>;
  open: boolean;
  revision: number;
}
type DismissReason = 'close' | 'timeout' | 'escape' | 'clickaway' | 'navigation';
interface ToastApi { show: (options: ToastOptions) => string; dismiss: (id: string, reason?: DismissReason) => void; notifyNavigation: (screenKey: string) => void; }
const ToastContext = createContext<ToastApi | null>(null);
const positionSx: Record<ToastPosition, Record<string, unknown>> = {
  'top-left': { top: 16, left: 16 }, 'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)' }, 'top-right': { top: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 }, 'bottom-center': { bottom: 16, left: '50%', transform: 'translateX(-50%)' }, 'bottom-right': { bottom: 16, right: 16 },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const serial = useRef(0);
  const sequence = useRef(0);
  const theme = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fadeEasing = 'cubic-bezier(0.2, 0, 0, 1)';
  const dismiss = useCallback((id: string, reason: DismissReason = 'close') => {
    const toast = toastsRef.current.find(item => item.id === id);
    if (!toast || !toast.open) return;
    if (reason === 'navigation' && toast.scope.type !== 'screen') return;
    if (toast.dismissPolicy === 'manual' && reason !== 'close' && reason !== 'navigation') return;
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => {
      const next = current.map(item => item.id === id ? { ...item, open: false, revision: ++sequence.current } : item);
      toastsRef.current = next;
      return next;
    });
  }, []);
  const notifyNavigation = useCallback((screenKey: string) => {
    for (const toast of toastsRef.current) {
      if (toast.scope.type === 'screen' && toast.scope.key !== screenKey) dismiss(toast.id, 'navigation');
    }
  }, [dismiss]);
  const show = useCallback((options: ToastOptions) => {
    const id = options.id ?? `toast-${++serial.current}`;
    const record: ToastRecord = {
      id, title: options.title ?? '', message: options.message, severity: options.severity ?? 'info',
      position: options.position ?? 'bottom-right', ttlMs: options.ttlMs === undefined ? 5000 : options.ttlMs,
      closeButton: options.closeButton ?? true, dismissPolicy: options.dismissPolicy ?? 'automatic', action: options.action,
      scope: options.scope ?? { type: 'global' }, open: true, revision: ++sequence.current,
    };
    const oldTimer = timers.current.get(id);
    if (oldTimer) clearTimeout(oldTimer);
    timers.current.delete(id);
    setToasts(current => {
      const next = current.some(item => item.id === id) ? current.map(item => item.id === id ? record : item) : [...current, record];
      toastsRef.current = next;
      return next;
    });
    if (record.dismissPolicy !== 'manual' && record.ttlMs !== null && record.ttlMs > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id, 'timeout'), record.ttlMs));
    }
    return id;
  }, [dismiss]);
  const removeExited = useCallback((id: string, revision: number) => {
    setToasts(current => {
      const next = current.filter(item => item.id !== id || item.open || item.revision !== revision);
      toastsRef.current = next;
      return next;
    });
  }, []);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);
  const api = useMemo(() => ({ show, dismiss, notifyNavigation }), [show, dismiss, notifyNavigation]);
  const byPosition = new Map<ToastPosition, ToastRecord[]>();
  for (const toast of toasts) byPosition.set(toast.position, [...(byPosition.get(toast.position) ?? []), toast]);
  return <ToastContext.Provider value={api}>{children}{typeof document !== 'undefined' && createPortal(<>
    {[...byPosition].map(([position, items]) => <Stack key={position} data-testid={`toast-position-${position}`} spacing={1} sx={{ position: 'fixed', zIndex: 1200, width: 'max-content', maxWidth: 'min(420px, calc(100vw - 32px))', ...positionSx[position], '@supports (padding: max(0px))': { padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' } }}>
      {items.map(toast => <Fade key={toast.id} in={toast.open} appear timeout={reducedMotion ? 0 : { enter: 180, exit: 140 }} easing={{ enter: fadeEasing, exit: fadeEasing }} onExited={() => removeExited(toast.id, toast.revision)}>
        <Alert aria-hidden={!toast.open || undefined} inert={!toast.open} severity={toast.severity} role={!toast.open ? undefined : toast.severity === 'error' ? 'alert' : 'status'} variant="standard" action={<Stack direction="row" alignItems="center" spacing={0.5}>
          {toast.action && <Button color="inherit" size="small" onClick={toast.action.onClick}>{toast.action.label}</Button>}
          {toast.closeButton && <IconButton aria-label="Close notification" color="inherit" size="small" onClick={() => dismiss(toast.id, 'close')}><CloseRoundedIcon fontSize="small" /></IconButton>}
        </Stack>} sx={{ width: '100%', boxShadow: '0 2px 8px rgba(70, 38, 20, 0.06)', border: 1, borderColor: alpha(theme.palette.divider, 0.55), alignItems: 'flex-start', overflowWrap: 'anywhere', pointerEvents: toast.open ? 'auto' : 'none', '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}>
          {toast.title && <AlertTitle>{toast.title}</AlertTitle>}{toast.message}
        </Alert>
      </Fade>)}
    </Stack>)}
  </>, document.body)}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
