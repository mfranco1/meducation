import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminSaveReviewDialog } from './AdminSaveReviewDialog';
import type { PreparedSaveReview } from '../data/HttpQuestionBankGateway';
const review: PreparedSaveReview = {
  reason: 'Preserve exact authored text',
  expected: { draftRevision: '12', publicationSequence: '5' },
  impact: {
    previewFingerprint: 'private',
    counts: { questions: { before: 10, after: 10, created: 0, updated: 4, deleted: 0 } },
    validation: { warnings: 2 },
    affectedIds: { updated: ['i1', 'i2'] },
    totalAffected: { updated: 4 },
    requiresFreshAuthentication: false,
  },
};
it('initially focuses Keep editing and presents warning counts and bounded impact truthfully', () => {
  const onCancel = vi.fn();
  render(<AdminSaveReviewDialog review={review} onCancel={onCancel} onConfirm={() => {}} />);
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  expect(screen.getByText('Change reason: Preserve exact authored text')).toBeVisible();
  expect(screen.getByText(/4 changed/)).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('2 validation warnings');
  fireEvent.click(screen.getByText('updated: 4 affected records'));
  expect(screen.getByText('Showing 2 of 4')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(onCancel).toHaveBeenCalledOnce();
});
it('requests explicit save only when the author confirms', () => {
  const onConfirm = vi.fn();
  render(<AdminSaveReviewDialog review={review} onCancel={() => {}} onConfirm={onConfirm} />);
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
