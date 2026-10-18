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
    show: vi.fn(),
    close: vi.fn(),
    chooseFile: vi.fn(async () => undefined),
    download: vi.fn(),
    downloadCurrent: vi.fn(),
    restore: vi.fn(),
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
        currentBackup: '{"valid":true}',
      },
    });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('dialog', { name: 'Progress backup' })).toBeVisible();
    expect(screen.getByText('This backup has no saved progress. Replacing clears all quiz and flashcard progress in this browser.')).toBeVisible();
    expect(within(screen.getByRole('table', { name: 'Backup comparison' })).getByRole('row', { name: 'Completions 0 61' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Download current progress first' }));
    expect(actions.downloadCurrent).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Replace my progress' }));
    expect(actions.restore).toHaveBeenCalledOnce();
  });

  it('omits the browser column and the current-backup action when current progress cannot be read', () => {
    render(<ProgressBackupDialog controller={controller({
      preview: { backup: fixture as unknown as ProgressBackupV1, summary: { savedQuizzes: 3, savedFlashcardDecks: 1, completions: 5 }, currentProgressIssue: 'corrupt' },
    })} />);
    expect(screen.queryByRole('columnheader', { name: 'This browser' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download current progress first' })).toBeNull();
    expect(screen.getByText(/could not be read and will be lost/)).toBeVisible();
  });

  it('confirms a finished download politely', () => {
    render(<ProgressBackupDialog controller={controller({ notice: 'Backup downloaded.' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Backup downloaded.');
  });

  it('prevents dismissal while a restore is in progress', () => {
    const actions = controller({ busy: true, committing: true });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Progress backup' }), { key: 'Escape' });
    expect(actions.close).not.toHaveBeenCalled();
  });
});
