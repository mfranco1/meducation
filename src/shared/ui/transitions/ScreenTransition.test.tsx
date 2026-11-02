import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

  it('returns to the saved scroll position only where restoreScroll allows it', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const restoreScroll = (from: string, to: string) => to === 'dashboard' && from.startsWith('subject:');
    const { rerender } = render(<ScreenTransition screenId="dashboard" restoreScroll={restoreScroll}><p>Dashboard</p></ScreenTransition>);
    window.scrollY = 800;
    fireEvent.scroll(window);

    rerender(<ScreenTransition screenId="subject:anatomy" restoreScroll={restoreScroll}><p>Anatomy</p></ScreenTransition>);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    rerender(<ScreenTransition screenId="dashboard" restoreScroll={restoreScroll}><p>Dashboard</p></ScreenTransition>);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 800);

    rerender(<ScreenTransition screenId="quiz:quiz-1:attempt-1" restoreScroll={restoreScroll}><p>Quiz</p></ScreenTransition>);
    rerender(<ScreenTransition screenId="dashboard" restoreScroll={restoreScroll}><p>Dashboard</p></ScreenTransition>);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    scrollTo.mockRestore();
  });
});

it('preserves scroll through subject tabs and restores only the matching dashboard', () => {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((x, y) => { if (typeof x === 'number') window.scrollY = y ?? 0; });
  const restoreScroll = (from: string, to: string) => to === 'flashcards' && from.startsWith('flashcards-subject:');
  const { rerender } = render(<ScreenTransition screenId="flashcards" restoreScroll={restoreScroll}>Dashboard</ScreenTransition>);
  window.scrollY = 300;
  fireEvent.scroll(window);
  rerender(<ScreenTransition screenId="subject-browse:s1" scrollId="flashcards-subject:s1" restoreScroll={restoreScroll}>Decks</ScreenTransition>);
  expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  scrollTo.mockClear();
  window.scrollY = 80;
  fireEvent.scroll(window);
  rerender(<ScreenTransition screenId="subject-browse:s1" scrollId="subject:s1" restoreScroll={restoreScroll}>Quizzes</ScreenTransition>);
  expect(scrollTo).not.toHaveBeenCalled();
  rerender(<ScreenTransition screenId="flashcards" restoreScroll={restoreScroll}>Dashboard</ScreenTransition>);
  expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  window.scrollY = 220;
  fireEvent.scroll(window);
  rerender(<ScreenTransition screenId="subject-browse:s1" scrollId="subject:s1" restoreScroll={restoreScroll}>Quizzes</ScreenTransition>);
  rerender(<ScreenTransition screenId="subject-browse:s1" scrollId="flashcards-subject:s1" restoreScroll={restoreScroll}>Decks</ScreenTransition>);
  rerender(<ScreenTransition screenId="flashcards" restoreScroll={restoreScroll}>Dashboard</ScreenTransition>);
  expect(scrollTo).toHaveBeenLastCalledWith(0, 220);
  scrollTo.mockRestore();
});
