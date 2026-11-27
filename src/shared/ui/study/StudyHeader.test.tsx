import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudyHeader, StudyNavigationFooter } from './StudyHeader';

describe('study header progress', () => {
  it('reports completed items separately from the current position', () => {
    render(
      <StudyHeader
        title="Cardiac cycle"
        itemLabel="Question"
        index={49}
        total={120}
        exitLabel="Leave test"
        onExit={() => undefined}
        completed={10}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Cardiac cycle' })).toBeVisible();
    expect(screen.getByText('Question 50 of 120')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Questions answered' })).toHaveAttribute(
      'aria-valuetext',
      '10 of 120 answered',
    );
  });

  it('reports position when nothing is being completed', () => {
    render(
      <StudyHeader
        title="Cardiac cycle"
        itemLabel="Question"
        index={4}
        total={20}
        exitLabel="Leave review"
        onExit={() => undefined}
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Question position' })).toHaveAttribute(
      'aria-valuetext',
      'Question 5 of 20',
    );
  });
});

describe('study navigation footer', () => {
  it('links Report to a support message that names the item', () => {
    render(
      <StudyNavigationFooter
        index={0}
        total={2}
        onPrevious={() => undefined}
        onNext={() => undefined}
        onFinish={() => undefined}
        finishLabel="Finish"
        report={{ kind: 'Card', id: 'card-1' }}
      />,
    );
    const href = screen.getByRole('link', { name: 'Report a problem' }).getAttribute('href') ?? '';
    expect(new URL(href).searchParams.get('text')).toContain('Card card-1');
  });
});
