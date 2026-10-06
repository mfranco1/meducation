import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlashcardAdminPanel } from './FlashcardAdminPanel';
import { theme } from '../app/theme';
import { storedQuestionBank } from '../content/questionBank';

const props = { subjects: storedQuestionBank.subjects, onBankChange: () => {}, quizRevision: 'quiz-current', originalQuizRevision: 'quiz-base', quizChangesStaged: false };

describe('FlashcardAdminPanel', () => {
  it('creates and stages a topic under an authoritative shared subject', () => {
    render(<ThemeProvider theme={theme}><FlashcardAdminPanel {...props} /></ThemeProvider>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add topic' })[0]);
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    const topic = JSON.parse((editor as HTMLTextAreaElement).value) as { id: string; subjectId: string; name: string };
    expect(topic.id).toMatch(/^t-/);
    expect(topic.subjectId).toBe('s1');
    fireEvent.change(editor, { target: { value: JSON.stringify({ ...topic, name: 'Test topic' }, null, 2) } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByText('Test topic')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export flashcard JSON and change set' })).toBeEnabled();
  });

  it('rejects a topic that references an unknown shared subject', () => {
    render(<ThemeProvider theme={theme}><FlashcardAdminPanel {...props} /></ThemeProvider>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add topic' })[0]);
    const editor = screen.getByRole('textbox', { name: 'Record JSON' });
    fireEvent.change(editor, { target: { value: JSON.stringify({ id: 't-invalid', subjectId: 'missing', name: 'Invalid' }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage record' }));
    expect(screen.getByRole('alert')).toHaveTextContent('unknown subject');
    expect(screen.queryByText('Invalid')).toBeNull();
  });
});
