import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { PairedSnapshot } from '../data/PairedHttpClient';
import { AdminDraftHistoryDialog } from './AdminDraftHistoryDialog';
const snapshot = {
  draft: { revision: '5' },
  publication: { sequence: '3' },
  undo: { targetRevision: '4' },
} as PairedSnapshot;
it('lets an author close an uncertain history review to reach reconciliation while keeping writes blocked', () => {
  const onCancel = vi.fn();
  render(
    <AdminDraftHistoryDialog
      review={{ action: 'reset', snapshot }}
      busy={false}
      blocked
      stale={false}
      error="We could not confirm this operation."
      onCancel={onCancel}
      onConfirm={() => {}}
    />,
  );
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  expect(cancel).toHaveFocus();
  expect(cancel).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Reset draft' })).toBeDisabled();
  expect(screen.getByText(/Unsaved editor text/)).toBeVisible();
  fireEvent.click(cancel);
  expect(onCancel).toHaveBeenCalledOnce();
});
it('prevents a stale history review from confirming and names the target revision', () => {
  render(
    <AdminDraftHistoryDialog
      review={{ action: 'undo', snapshot }}
      busy={false}
      stale
      error=""
      onCancel={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByText(/revision 5 to saved snapshot 4/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Undo saved change' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
});
