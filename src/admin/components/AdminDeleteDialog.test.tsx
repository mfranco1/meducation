import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { AdminDeleteDialog } from './AdminDeleteDialog';

it('requires a current review and disables repeated confirmation while staging', () => {
  const bank = fixture as StoredQuestionBank;
  const props = { bank, flashcardBank: { schemaVersion: 2 as const, decks: [], cards: [] }, request: { selection: { kind: 'quiz' as const, id: 'q1' }, label: 'First quiz', reviewKey: 'original' }, onClose: vi.fn(), onConfirm: vi.fn() };
  const { rerender } = render(<AdminDeleteDialog {...props} currentReviewKey="changed" />);
  expect(screen.getByRole('button', { name: 'Stage quiz deletion' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('content changed');
  rerender(<AdminDeleteDialog {...props} currentReviewKey="original" />);
  fireEvent.click(screen.getByRole('button', { name: 'Stage quiz deletion' }));
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
  rerender(<AdminDeleteDialog {...props} currentReviewKey="original" busy />);
  expect(screen.getByRole('button', { name: 'Stage quiz deletion' })).toBeDisabled();
});
