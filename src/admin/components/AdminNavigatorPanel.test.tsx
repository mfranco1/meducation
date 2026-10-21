import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from '../../content/schema/schema';
import { theme } from '../../shared/theme';
import type { DraftFlashcardBank, DraftQuizBank } from '../data/DraftStore';
import { AdminNavigatorPanel } from './AdminNavigatorPanel';

const source = fixture as StoredQuestionBank;
const versioned = <T extends object>(rows: T[]) => rows.map((row) => ({ ...row, version: 1 }));
const bank: DraftQuizBank = {
  schemaVersion: 6,
  subjects: versioned(source.subjects),
  topics: versioned(source.topics),
  quizzes: versioned(source.quizzes),
  questions: versioned(source.questions),
};
const noCards: DraftFlashcardBank = { schemaVersion: 4, decks: [], cards: [] };

describe('admin quiz navigator presentation contracts', () => {
  it('offers subject creation when no subject is selected', () => {
    const onManageSubjects = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={bank}
          flashcardBank={noCards}
          selection={{ kind: 'subject' }}
          filter=""
          setFilter={vi.fn()}
          loadEntity={vi.fn()}
          onNewTopic={vi.fn()}
          onManageSubjects={onManageSubjects}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add subject' }));
    expect(onManageSubjects).toHaveBeenCalledExactlyOnceWith();
  });

  it('browses the selected quiz in canonical order and passes unchanged records to the editor', () => {
    const loadEntity = vi.fn();
    const setFilter = vi.fn();
    const chooseBulkTarget = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={bank}
          flashcardBank={noCards}
          selection={{ kind: 'quiz', id: 'q1', parentId: 't1' }}
          selectedSubjectId="s1"
          selectedTopicId="t1"
          selectedQuizId="q1"
          filter=""
          setFilter={setFilter}
          loadEntity={loadEntity}
          chooseBulkTarget={chooseBulkTarget}
          onNewTopic={vi.fn()}
          onManageSubjects={vi.fn()}
        />
      </ThemeProvider>,
    );
    const questions = bank.questions.filter((question) => question.quizId === 'q1');
    const rows = screen
      .getAllByRole('button')
      .filter((row) => questions.some((question) => row.textContent?.includes(question.id)));
    expect(rows.map((row) => row.textContent)).toEqual(
      questions.map((question, index) => `${index + 1}. ${question.id}${question.stem.slice(0, 64)}`),
    );
    fireEvent.click(rows[0]);
    expect(loadEntity).toHaveBeenCalledExactlyOnceWith(
      { kind: 'question', id: questions[0].id, parentId: 'q1' },
      questions[0],
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search items in this quiz' }), {
      target: { value: 'Subject One' },
    });
    expect(setFilter).toHaveBeenCalledExactlyOnceWith('Subject One');
    fireEvent.click(screen.getByRole('button', { name: 'Add questions' }));
    expect(chooseBulkTarget).toHaveBeenCalledExactlyOnceWith('quiz', { subjectId: 's1', topicId: 't1', quizId: 'q1' });
  });

  it('lists the topics of a subject and deletes the ticked ones together', () => {
    const onDeleteMany = vi.fn();
    const twoTopics = { ...bank, topics: [...bank.topics, { ...bank.topics[0], id: 't3', name: 'Second topic' }] };
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={twoTopics}
          flashcardBank={noCards}
          selection={{ kind: 'subject' }}
          selectedSubjectId="s1"
          filter=""
          setFilter={vi.fn()}
          loadEntity={vi.fn()}
          onDeleteMany={onDeleteMany}
          onNewTopic={vi.fn()}
          onManageSubjects={vi.fn()}
        />
      </ThemeProvider>,
    );
    const list = screen.getByRole('navigation', { name: /^Topics in / });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select topic t1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select topic t3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected…' }));
    expect(onDeleteMany).toHaveBeenCalledExactlyOnceWith('topic', 's1', ['t1', 't3']);
  });

  it('filters topics by content so only the shown topics are deleted', () => {
    const onDeleteMany = vi.fn();
    const twoTopics = { ...bank, topics: [...bank.topics, { ...bank.topics[0], id: 't3', name: 'Empty topic' }] };
    render(
      <ThemeProvider theme={theme}>
        <AdminNavigatorPanel
          bank={twoTopics}
          flashcardBank={noCards}
          selection={{ kind: 'subject' }}
          selectedSubjectId="s1"
          filter=""
          setFilter={vi.fn()}
          loadEntity={vi.fn()}
          onDeleteMany={onDeleteMany}
          onNewTopic={vi.fn()}
          onManageSubjects={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Show topics' }));
    fireEvent.click(screen.getByRole('option', { name: 'Empty topics' }));
    const list = screen.getByRole('navigation', { name: /^Topics in / });
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list.textContent).toContain('t3 · 0 items · 0 cards');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select this page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected…' }));
    expect(onDeleteMany).toHaveBeenCalledExactlyOnceWith('topic', 's1', ['t3']);
  });
});
