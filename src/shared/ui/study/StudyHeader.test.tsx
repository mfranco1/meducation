import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudyHeader } from './StudyHeader';

describe('study header progress', () => {
  it('reports completed items separately from the current position', () => {
    render(<StudyHeader itemLabel="Question" index={49} total={120} exitLabel="Leave test" onExit={() => undefined} completed={10} />);
    expect(screen.getByText('Question 50 of 120')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Questions answered' })).toHaveAttribute('aria-valuetext', '10 of 120 answered');
  });

  it('reports position when nothing is being completed', () => {
    render(<StudyHeader itemLabel="Question" index={4} total={20} exitLabel="Leave review" onExit={() => undefined} />);
    expect(screen.getByRole('progressbar', { name: 'Question position' })).toHaveAttribute('aria-valuetext', 'Question 5 of 20');
  });
});
