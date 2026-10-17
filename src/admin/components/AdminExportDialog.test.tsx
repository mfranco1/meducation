import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminExportDialog } from './AdminExportDialog';

it.each([
  ['Saved draft', 'draft', 'Saved draft (change 42)'],
  ['Current published version', 'current', 'Published version current-release'],
  ['Selected published version', 'selected', 'Published version older-release'],
])('exports the explicit %s target and identifies omitted unsaved text', (label, target, context) => {
  const onExport = vi.fn();
  render(
    <AdminExportDialog
      open
      busy={false}
      currentReleaseId="current-release"
      selectedReleaseId="older-release"
      draftLabel="(change 42)"
      onClose={() => {}}
      onExport={onExport}
    />,
  );
  expect(screen.getByText(/Unsaved editor text is excluded/)).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Export target' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
  expect(screen.getByText(context)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Export paired ZIP' }));
  expect(onExport).toHaveBeenLastCalledWith(target);
});
it('opens a selected version export explicitly and prevents duplicate submit while busy', () => {
  render(
    <AdminExportDialog
      open
      busy
      initialTarget="selected"
      currentReleaseId="current"
      selectedReleaseId="older"
      draftLabel="(change 42)"
      onClose={() => {}}
      onExport={() => {}}
    />,
  );
  expect(screen.getByText('Published version older')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Export paired ZIP' })).toBeDisabled();
});
