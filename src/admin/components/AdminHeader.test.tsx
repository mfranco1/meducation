import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminHeader } from './AdminHeader';
it('keeps the blocked-publication explanation visible and utilities in labelled menus', () => {
  const onExport = vi.fn();
  const onChanges = vi.fn();
  const onDiscard = vi.fn();
  render(
    <AdminHeader
      status="Unsaved edits"
      publishBlocked="Save edits in Flashcards before publishing."
      busy={false}
      discardAvailable
      onStatus={() => {}}
      onPublish={() => {}}
      onExport={onExport}
      onVersions={() => {}}
      onChanges={onChanges}
      onDiscard={onDiscard}
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
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.queryByRole('menuitem', { name: /undo|reset/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Changes…' }));
  expect(onChanges).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Discard unpublished changes…' }));
  expect(onDiscard).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  expect(screen.getByRole('menuitem', { name: 'Refresh authentication' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});
