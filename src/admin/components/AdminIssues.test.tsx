import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AdminIssues } from './AdminIssues';

it('puts the actionable error first and pages or filters complete diagnostics without losing paths', () => {
  const issues = [...Array.from({ length: 23 }, (_, index) => ({ level: 'warning' as const, message: `Review ${index}` })), { level: 'error' as const, questionId: 'i-stale', message: 'Fix this record' }];
  render(<AdminIssues issues={issues} questionPaths={{ 'i-stale': '$.items[23]' }} />);
  const list = screen.getByRole('list', { name: 'Validation issues' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(10);
  expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('ERROR $.items[23]: Fix this record');
  fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Warnings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next issue page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next issue page' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  expect(list).toHaveTextContent('Review 22');
  expect(issues.at(-1)?.level).toBe('error');
});
