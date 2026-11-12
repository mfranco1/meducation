import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { matchMediaFor } from '../../../test/setup';
import { ShortcutTip } from './ShortcutTip';

const renderTip = (onDone = vi.fn()) => {
  render(<ShortcutTip message="Press Space to reveal." keys={[' ']} onDone={onDone} />);
  return onDone;
};

describe('ShortcutTip', () => {
  it('stays hidden without a fine pointer', () => {
    renderTip();
    expect(screen.queryByText('Press Space to reveal.')).not.toBeInTheDocument();
  });

  it('is done when dismissed or when its shortcut is used', () => {
    window.matchMedia = matchMediaFor(() => true);
    const onDone = renderTip();
    expect(screen.getByText('Press Space to reveal.')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'x' });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(onDone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
