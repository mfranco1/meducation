import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, AlertTitle, Button, IconButton, Stack } from '@mui/material';
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
}
interface ToastRecord extends Required<Omit<ToastOptions, 'message' | 'ttlMs' | 'action'>> {
  id: string;
  message: ReactNode;
  ttlMs: number | null;
  action?: ToastOptions['action'];
}
interface ToastApi { show: (options: ToastOptions) => string; dismiss: (id: string, reason?: 'close' | 'timeout' | 'escape' | 'clickaway') => void; }
const ToastContext = createContext<ToastApi | null>(null);
const positionSx: Record<ToastPosition, Record<string, unknown>> = {
  'top-left': { top: 16, left: 16 }, 'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)' }, 'top-right': { top: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 }, 'bottom-center': { bottom: 16, left: '50%', transform: 'translateX(-50%)' }, 'bottom-right': { bottom: 16, right: 16 },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const serial = useRef(0);
  const dismiss = useCallback((id: string, reason: 'close' | 'timeout' | 'escape' | 'clickaway' = 'close') => {
    const toast = toasts.find(item => item.id === id);
    if (!toast || (toast.dismissPolicy === 'manual' && reason !== 'close')) return;
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(item => item.id !== id));
  }, [toasts]);
  const show = useCallback((options: ToastOptions) => {
    const id = options.id ?? `toast-${++serial.current}`;
    const record: ToastRecord = {
      id, title: options.title ?? '', message: options.message, severity: options.severity ?? 'info',
      position: options.position ?? 'bottom-right', ttlMs: options.ttlMs === undefined ? 5000 : options.ttlMs,
      closeButton: options.closeButton ?? true, dismissPolicy: options.dismissPolicy ?? 'automatic', action: options.action,
    };
    const oldTimer = timers.current.get(id);
    if (oldTimer) clearTimeout(oldTimer);
    timers.current.delete(id);
    setToasts(current => current.some(item => item.id === id) ? current.map(item => item.id === id ? record : item) : [...current, record]);
    if (record.dismissPolicy !== 'manual' && record.ttlMs !== null && record.ttlMs > 0) {
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setToasts(current => current.filter(item => item.id !== id));
      }, record.ttlMs));
    }
    return id;
  }, []);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear(); }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const byPosition = new Map<ToastPosition, ToastRecord[]>();
  for (const toast of toasts) byPosition.set(toast.position, [...(byPosition.get(toast.position) ?? []), toast]);
  return <ToastContext.Provider value={api}>{children}{typeof document !== 'undefined' && createPortal(<>
    {[...byPosition].map(([position, items]) => <Stack key={position} data-testid={`toast-position-${position}`} spacing={1} sx={{ position: 'fixed', zIndex: 1200, width: 'max-content', maxWidth: 'min(420px, calc(100vw - 32px))', ...positionSx[position], '@supports (padding: max(0px))': { padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' } }}>
      {items.map(toast => <Alert key={toast.id} severity={toast.severity} role={toast.severity === 'error' ? 'alert' : 'status'} variant="standard" action={<Stack direction="row" alignItems="center" spacing={0.5}>
        {toast.action && <Button color="inherit" size="small" onClick={toast.action.onClick}>{toast.action.label}</Button>}
        {toast.closeButton && <IconButton aria-label="Close notification" color="inherit" size="small" onClick={() => dismiss(toast.id, 'close')}><CloseRoundedIcon fontSize="small" /></IconButton>}
      </Stack>} sx={{ width: '100%', boxShadow: 4, border: 1, borderColor: 'divider', alignItems: 'flex-start', overflowWrap: 'anywhere', '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}>
        {toast.title && <AlertTitle>{toast.title}</AlertTitle>}{toast.message}
      </Alert>)}
    </Stack>)}
  </>, document.body)}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
