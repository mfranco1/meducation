import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ScreenTransition } from './ScreenTransition';

describe('ScreenTransition', () => {
  it('does not animate the initial screen, then animates each new destination', () => {
    const { rerender } = render(<ScreenTransition screenId="dashboard"><p>Dashboard</p></ScreenTransition>);
    expect(screen.getByTestId('screen-transition')).toHaveAttribute('data-animated', 'false');

    rerender(<ScreenTransition screenId="subject:anatomy"><p>Anatomy</p></ScreenTransition>);
    expect(screen.getByTestId('screen-transition')).toHaveAttribute('data-animated', 'true');
    expect(screen.getByText('Anatomy')).toBeVisible();

    rerender(<ScreenTransition screenId="quiz:quiz-1:attempt-1"><p>Quiz</p></ScreenTransition>);
    expect(screen.getByTestId('screen-transition')).toHaveAttribute('data-animated', 'true');
  });

  it('keeps the current screen mounted through same-destination updates', () => {
    function Screen() {
      const [count, setCount] = useState(0);
      return <>
        <button onClick={() => setCount(value => value + 1)}>Update in screen</button>
        <output>{count}</output>
      </>;
    }
    const { rerender } = render(<ScreenTransition screenId="quiz:quiz-1:attempt-1"><Screen /></ScreenTransition>);
    fireEvent.click(screen.getByRole('button', { name: 'Update in screen' }));
    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getByTestId('screen-transition')).toHaveAttribute('data-animated', 'false');

    rerender(<ScreenTransition screenId="quiz:quiz-1:attempt-1"><Screen /></ScreenTransition>);
    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getByTestId('screen-transition')).toHaveAttribute('data-animated', 'false');
  });
});
