import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { DraftChange } from '../data/DraftStore';
import { AdminChangesDialog } from './AdminChangesDialog';

const change = (changeId: number): DraftChange => ({
  changeId,
  createdAt: '2026-01-01T00:00:00Z',
  actor: 'editor',
  kind: 'questions',
  entityId: `i${changeId}`,
  action: 'update',
  before: null,
  after: { stem: `Stem ${changeId}` },
});
const all = Array.from({ length: 60 }, (_, index) => change(index + 1));
const load = vi.fn(async (since: number, limit: number) => ({
  changes: all.filter((row) => row.changeId > since).slice(0, limit),
  hasMore: false,
}));

it('lists the newest changes first, loads older ones on request and reverts the chosen change', async () => {
  const onRevert = vi.fn();
  render(
    <AdminChangesDialog open busy={false} latestChangeId={60} publishedChangeId={50} load={load} onRevert={onRevert} onClose={() => {}} />,
  );
  const rows = await screen.findAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('update question i60 · Stem 60');
  expect(rows[0]).toHaveTextContent('#60');
  expect(rows[0]).not.toHaveTextContent('published');
  expect(rows).toHaveLength(25);
  expect(rows[10]).toHaveTextContent('#50 ');
  expect(rows[10]).toHaveTextContent('published');
  fireEvent.click(screen.getByRole('button', { name: 'Older changes' }));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(50));
  expect(screen.getAllByRole('listitem').at(-1)).toHaveTextContent('#11');
  fireEvent.click(screen.getByRole('button', { name: 'Revert change 60' }));
  expect(onRevert).toHaveBeenCalledWith(all[59]);
});

it('says so when nothing has been recorded', async () => {
  render(
    <AdminChangesDialog
      open
      busy={false}
      latestChangeId={0}
      publishedChangeId={null}
      load={async () => ({ changes: [], hasMore: false })}
      onRevert={() => {}}
      onClose={() => {}}
    />,
  );
  expect(await screen.findByText('No changes recorded yet.')).toBeVisible();
});
