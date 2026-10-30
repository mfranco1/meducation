import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/progress-backups/empty-v1.json';
import { ProgressBackupDialog } from './ProgressBackupDialog';
import type { ProgressBackupController } from '../useProgressBackup';
import type { ProgressBackupV1 } from '../../persistence/progressBackupCodec';

function controller(overrides: Partial<ProgressBackupController> = {}): ProgressBackupController {
  return {
    open: true,
    busy: false,
    committing: false,
    resetStep: false,
    show: vi.fn(),
    close: vi.fn(),
    chooseFile: vi.fn(async () => undefined),
    download: vi.fn(),
    restore: vi.fn(),
    requestReset: vi.fn(),
    cancelReset: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('progress backup dialog', () => {
  beforeEach(() => vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }));
  afterEach(() => vi.unstubAllGlobals());
  it('compares the file with this browser and warns when replacing with an empty backup', () => {
    const actions = controller({
      preview: {
        backup: fixture as unknown as ProgressBackupV1,
        summary: { savedQuizzes: 0, savedFlashcardDecks: 0, completions: 0 },
        currentSummary: { savedQuizzes: 9, savedFlashcardDecks: 4, completions: 61 },
      },
    });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('dialog', { name: 'Progress' })).toBeVisible();
    expect(screen.getByText('This replaces all quiz and flashcard progress in this browser. You cannot undo this.')).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Backup comparison' })).getByRole('row', { name: 'Completions 0 61' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(actions.restore).toHaveBeenCalledOnce();
  });

  it('omits the browser column when current progress cannot be read', () => {
    render(<ProgressBackupDialog controller={controller({
      preview: { backup: fixture as unknown as ProgressBackupV1, summary: { savedQuizzes: 3, savedFlashcardDecks: 1, completions: 5 } },
    })} />);
    expect(screen.queryByRole('columnheader', { name: 'This browser' })).toBeNull();
  });

  it('confirms a finished download politely', () => {
    render(<ProgressBackupDialog controller={controller({ notice: 'Backup downloaded.' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Backup downloaded.');
  });

  it('confirms a reset with the counts to delete', () => {
    const actions = controller({ resetStep: true, resetSummary: { savedQuizzes: 2, savedFlashcardDecks: 1, completions: 7 } });
    render(<ProgressBackupDialog controller={actions} />);
    expect(within(screen.getByRole('table', { name: 'Progress to delete' })).getByRole('row', { name: 'Completions 7' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(actions.reset).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(actions.cancelReset).toHaveBeenCalledOnce();
  });

  it('offers only Back when there is no progress to reset', () => {
    render(<ProgressBackupDialog controller={controller({ resetStep: true, resetSummary: { savedQuizzes: 0, savedFlashcardDecks: 0, completions: 0 } })} />);
    expect(screen.getByText('There is no saved progress to reset.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('prevents dismissal while a restore is in progress', () => {
    const actions = controller({ busy: true, committing: true });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Progress' }), { key: 'Escape' });
    expect(actions.close).not.toHaveBeenCalled();
  });
});
