import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAdminConfirmation } from './useAdminConfirmation';

function Probe({ context, onDecision }: { context: string; onDecision: (value: boolean) => void }) {
  const confirmation = useAdminConfirmation([context]);
  return (
    <>
      <button onClick={() => void confirmation.request('Discard exact unsaved text?').then(onDecision)}>
        Navigate
      </button>
      {confirmation.dialog}
    </>
  );
}
it('declines by default, restores focus, and only proceeds after explicit discard', async () => {
  const decide = vi.fn();
  render(<Probe context="original" onDecision={decide} />);
  const trigger = screen.getByText('Navigate');
  trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(decide).toHaveBeenLastCalledWith(false));
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Discard edits' }));
  await waitFor(() => expect(decide).toHaveBeenLastCalledWith(true));
});
it('declines an open review when text/context changes and on unmount', async () => {
  const decide = vi.fn();
  const view = render(<Probe context="original" onDecision={decide} />);
  fireEvent.click(screen.getByText('Navigate'));
  view.rerender(<Probe context="newer text" onDecision={decide} />);
  await waitFor(() => expect(decide).toHaveBeenCalledWith(false));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('Navigate'));
  view.unmount();
  await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
  expect(decide.mock.calls).toEqual([[false], [false]]);
});
