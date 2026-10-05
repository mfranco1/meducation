import { fireEvent, render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';

function Demo() {
  const toast = useToast();
  return <>
    <button onClick={() => toast.show({ id: 'persistent', title: 'Persistent', message: 'Stays open', severity: 'error', ttlMs: null, dismissPolicy: 'manual' })}>Show persistent</button>
    <button onClick={() => toast.show({ id: 'temporary', message: 'Short message', ttlMs: 1000 })}>Show temporary</button>
    <button onClick={() => toast.show({ id: 'persistent', title: 'Updated', message: 'Updated message', ttlMs: null, dismissPolicy: 'manual' })}>Update persistent</button>
  </>;
}

describe('ToastProvider', () => {
  it('keeps manual error toasts until their accessible close button is activated', () => {
    render(<ToastProvider><Demo /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show persistent' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Stays open');
    expect(screen.getByRole('button', { name: 'Close notification' })).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('updates by id without creating duplicates and honors finite TTLs', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Demo /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show persistent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update persistent' }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Updated message');
    fireEvent.click(screen.getByRole('button', { name: 'Show temporary' }));
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText('Short message')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Updated message');
    vi.useRealTimers();
  });

  it('supports caller-selected positions and actions', () => {
    const action = vi.fn();
    function PositionedDemo() {
      const toast = useToast();
      return <button onClick={() => toast.show({ id: 'positioned', message: 'Has action', position: 'top-left', action: { label: 'Open', onClick: action } })}>Show positioned</button>;
    }
    render(<ToastProvider><PositionedDemo /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show positioned' }));
    expect(screen.getByTestId('toast-position-top-left')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(action).toHaveBeenCalledOnce();
  });
});
