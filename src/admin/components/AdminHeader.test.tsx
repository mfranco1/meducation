import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminHeader } from './AdminHeader';
it('keeps the blocked-publication explanation visible and utilities in labelled menus', () => {
  const onExport = vi.fn();
  render(
    <AdminHeader
      status="Unsaved edits"
      publishBlocked="Save edits in Flashcards before publishing."
      busy={false}
      undoAvailable
      publicationAvailable
      onStatus={() => {}}
      onPublish={() => {}}
      onExport={onExport}
      onVersions={() => {}}
      onUndo={() => {}}
      onReset={() => {}}
      onRefresh={() => {}}
      onLogin={() => {}}
      onLogout={() => {}}
      sessionDetails="Signed in"
    />,
  );
  expect(screen.getByRole('button', { name: 'Review & publish' })).toBeDisabled();
  expect(screen.getByText('Save edits in Flashcards before publishing.')).toBeVisible();
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export content…' }));
  expect(onExport).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  expect(screen.getByRole('menuitem', { name: 'Refresh authentication' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});
