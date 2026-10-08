import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { theme } from '../../shared/theme';
import { AdminNavigatorPanel } from './AdminNavigatorPanel';

const bank = fixture as StoredQuestionBank;

describe('admin quiz navigator presentation contracts', () => {
  it('keeps parent-dependent creation unavailable until a destination is selected', () => {
    const loadNew = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={bank}
          selection={{ kind: 'subject' }}
          filter=""
          setFilter={vi.fn()}
          loadEntity={vi.fn()}
          loadNew={loadNew}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('menuitem', { name: 'Quiz' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Item' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Subject' }));
    expect(loadNew).toHaveBeenCalledExactlyOnceWith('subject');
  });

  it('browses the selected quiz in canonical order and passes unchanged records to the editor', () => {
    const loadEntity = vi.fn();
    const loadNew = vi.fn();
    const setFilter = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={bank}
          selection={{ kind: 'quiz', id: 'q1', parentId: 's1' }}
          selectedSubjectId="s1"
          selectedQuizId="q1"
          filter=""
          setFilter={setFilter}
          loadEntity={loadEntity}
          loadNew={loadNew}
        />
      </ThemeProvider>,
    );
    const questions = bank.questions.filter((question) => question.quizId === 'q1');
    const rows = screen
      .getAllByRole('button')
      .filter((row) => questions.some((question) => row.textContent?.startsWith(question.id)));
    expect(rows.map((row) => row.textContent)).toEqual(
      questions.map((question) => `${question.id}${question.stem.slice(0, 64)}`),
    );
    fireEvent.click(rows[0]);
    expect(loadEntity).toHaveBeenCalledExactlyOnceWith(
      { kind: 'question', id: questions[0].id, parentId: 'q1' },
      questions[0],
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search subjects' }), { target: { value: 'Subject One' } });
    expect(setFilter).toHaveBeenCalledExactlyOnceWith('Subject One');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('menuitem', { name: 'Quiz' })).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Item' }));
    expect(loadNew).toHaveBeenCalledExactlyOnceWith('question');
  });
});
