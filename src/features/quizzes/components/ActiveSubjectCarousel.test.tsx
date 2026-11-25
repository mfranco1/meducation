import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubjectStat } from '../selectors/progress';
import { theme } from '../../../shared/theme';
import { ActiveSubjectCarousel } from './ActiveSubjectCarousel';

const stats: SubjectStat[] = [
  {
    subject: { id: 'biochem', name: 'Biochemistry', accent: '#b9511b' },
    quizCount: 8,
    completedQuizCount: 3,
    activeQuizCount: 1,
    latest: 74,
  },
  {
    subject: { id: 'physio', name: 'Physiology', accent: '#b9511b' },
    quizCount: 6,
    completedQuizCount: 0,
    activeQuizCount: 2,
  },
];

/** The one card a learner can reach; peeking cards and loop copies are inert. */
function centeredCard() {
  const [card, ...others] = screen
    .getAllByRole('button', { name: /^Continue studying / })
    .filter((button) => !button.closest('[inert]'));
  expect(others).toHaveLength(0);
  return card!;
}

function renderCarousel(subjects = stats) {
  const onSelectSubject = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <ActiveSubjectCarousel subjects={subjects} onSelectSubject={onSelectSubject} />
    </ThemeProvider>,
  );
  return { onSelectSubject };
}

describe('ActiveSubjectCarousel', () => {
  it('does not render without active subjects', () => {
    renderCarousel([]);

    expect(screen.queryByRole('region', { name: 'Continue Studying' })).toBeNull();
  });

  it('provides working forward and backward carousel controls', () => {
    renderCarousel();

    const biochemistry = centeredCard();
    expect(biochemistry).toHaveAccessibleName('Continue studying Biochemistry');
    expect(biochemistry).toHaveAccessibleDescription('1 quiz in progress 3 of 8 quizzes completed');
    expect(within(biochemistry).getByText('3 of 8 quizzes completed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(centeredCard()).toHaveAccessibleName('Continue studying Physiology');
    expect(centeredCard()).toHaveAccessibleDescription('2 quizzes in progress 0 of 6 quizzes completed');
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(centeredCard()).toHaveAccessibleName('Continue studying Biochemistry');
    fireEvent.click(screen.getByRole('button', { name: 'Previous active subject' }));
    expect(centeredCard()).toHaveAccessibleName('Continue studying Physiology');
  });

  it('marks the selected subject with a dot and moves to the subject of the dot chosen', () => {
    renderCarousel();

    expect(screen.getByRole('button', { name: 'Show active subject 1 of 2' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Show active subject 2 of 2' }));
    expect(centeredCard()).toHaveAccessibleName('Continue studying Physiology');
    expect(screen.getByRole('button', { name: 'Show active subject 2 of 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('keeps only the five most recent subjects', () => {
    renderCarousel(
      Array.from({ length: 7 }, (_, index) => ({
        ...stats[1],
        subject: { ...stats[1].subject, id: `s${index}`, name: `Subject ${index}` },
      })),
    );

    expect(screen.getAllByRole('button', { name: /^Show active subject \d of 5$/ })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Continue studying Subject 5' })).toBeNull();
  });

  it('selects the visible subject', () => {
    const { onSelectSubject } = renderCarousel();

    fireEvent.click(centeredCard());

    expect(onSelectSubject).toHaveBeenCalledWith(stats[0].subject);
  });

  it('omits navigation controls for one active subject', () => {
    renderCarousel([stats[0]]);

    expect(screen.queryByRole('button', { name: /active subject/ })).toBeNull();
  });
});
