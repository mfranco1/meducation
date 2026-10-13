import { render, screen, fireEvent } from '@testing-library/react';
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
    recoveryRequired: false,
    show: vi.fn(),
    close: vi.fn(),
    chooseFile: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    downloadCurrent: vi.fn(async () => undefined),
    downloadRawRecovery: vi.fn(),
    restore: vi.fn(async () => undefined),
    retryRecovery: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('progress backup dialog', () => {
  beforeEach(() => vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }));
  afterEach(() => vi.unstubAllGlobals());
  it('shows a distinct preview and warns when restoring an empty backup', () => {
    const actions = controller({
      preview: {
        backup: fixture as unknown as ProgressBackupV1,
        summary: { retainedCompletedAttempts: 0, savedQuizzes: 0, savedFlashcardDecks: 0, quizCompletions: 0, flashcardCompletions: 0, totalRecordedCompletions: '0' },
        original: { quiz: null, flashcards: null },
        currentBackup: '{"valid":true}',
      },
    });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('dialog', { name: 'Progress backup' })).toBeVisible();
    expect(screen.getByText('This backup contains no saved progress. Restoring it clears all quiz and flashcard progress in this browser.')).toBeVisible();
    expect(screen.getByText('Total recorded completions: 0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Download current backup first' }));
    expect(actions.downloadCurrent).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    expect(actions.restore).toHaveBeenCalledOnce();
  });

  it('prevents dismissal while restore or recovery is in progress', () => {
    const actions = controller({ busy: true, recoveryRequired: true });
    render(<ProgressBackupDialog controller={actions} />);
    expect(screen.getByRole('button', { name: 'Retry recovery' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Progress backup' }), { key: 'Escape' });
    expect(actions.close).not.toHaveBeenCalled();
  });
});
