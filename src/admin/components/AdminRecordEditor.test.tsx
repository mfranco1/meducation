import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { AdminRecordEditor } from './AdminRecordEditor';
const row = {
  id: 'i1',
  quizId: 'q1',
  stem: 'Exact <b>stem</b> $x^2$\n',
  choices: [
    { id: 'original-id', text: 'Choice $x^2$' },
    { id: 'Z', text: 'Second' },
  ],
  answer: 'original-id',
  verifiedAnswer: 'Z',
  rationale: '<p>Exact rationale $x^2$</p>\n',
  metadata: { tags: [' exact '] },
};
function Editor({ raw = JSON.stringify(row), change = () => {} }: { raw?: string; change?: (text: string) => void }) {
  const [text, setText] = useState(raw);
  return (
    <AdminRecordEditor
      kind="question"
      text={text}
      existing
      onChange={(value) => {
        setText(value);
        change(value);
      }}
    />
  );
}
it('changes views without editing the draft and renders rich/restricted preview with original provenance', () => {
  const change = vi.fn();
  const raw = JSON.stringify(row, null, 4) + '\n';
  render(<Editor raw={raw} change={change} />);
  expect(screen.getByRole('textbox', { name: 'ID' })).toHaveAttribute('readonly');
  expect(screen.getByRole('textbox', { name: 'Source answer' })).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  const preview = screen.getByRole('region', { name: 'Rendered content preview' });
  expect(preview.querySelector('.katex')).not.toBeNull();
  expect(within(preview).getByText('Choice $x^2$')).toBeVisible();
  expect(within(preview).getByText('Source answer: original-id')).toBeVisible();
  expect(within(preview).getByText('Runtime answer: Z')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue(raw);
  expect(change).not.toHaveBeenCalled();
});
it('patches one form field while preserving source, choices and sparse metadata', () => {
  const change = vi.fn();
  render(<Editor change={change} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Question stem' }), { target: { value: '  New $5,000\n' } });
  expect(JSON.parse(change.mock.calls[0][0])).toEqual({ ...row, stem: '  New $5,000\n' });
});
it('retains invalid JSON and its editing view until the author explicitly selects a valid form', () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: '{ exact invalid\n' } });
  expect(screen.getByRole('tab', { name: 'Edit' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue('{ exact invalid\n');
  fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), { target: { value: JSON.stringify(row) } });
  expect(screen.getByRole('textbox', { name: 'JSON' })).toHaveValue(JSON.stringify(row));
  fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
  expect(screen.getByRole('textbox', { name: 'Question stem' })).toHaveValue(row.stem);
});
it('uses the shared sanitizer for hostile preview source without changing the source text', () => {
  const hostile = {
    ...row,
    stem: '<script>window.__bad = true</script><img src="javascript:alert(1)" onerror="alert(2)">Safe',
  };
  const change = vi.fn();
  render(<Editor raw={JSON.stringify(hostile)} change={change} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  const preview = screen.getByRole('region', { name: 'Rendered content preview' });
  expect(preview.querySelector('script')).toBeNull();
  expect(preview.querySelector('[onerror]')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
