import { questions, quizzes, schemaVersion, storedQuestionBank, subjects } from '../src/content/questionBank.ts';
import { flashcardRepository, storedFlashcardBank } from '../src/content/flashcardBank.ts';
import { validateQuestionMarkdown } from '../src/content/markdownValidation.ts';
import { validateFlashcardBank } from '../src/content/flashcardValidation.ts';
import { validateQuestionBank, validateStoredQuestionBank } from '../src/content/validate.ts';

const issues = [
  ...(schemaVersion === 4 ? [] : [{ level: 'error' as const, message: `Unsupported question bank schema version: ${schemaVersion}` }]),
  ...validateStoredQuestionBank(storedQuestionBank),
  ...validateQuestionBank(subjects, quizzes, questions),
  ...validateQuestionMarkdown(questions),
  ...validateFlashcardBank(storedFlashcardBank, subjects),
];
issues.forEach(issue => console.log(`${issue.level.toUpperCase()}${issue.questionId ? ` [${issue.questionId}]` : ''}: ${issue.message}`));
if (issues.some(issue => issue.level === 'error')) process.exitCode = 1;
else console.log(`Content valid: ${questions.length} questions across ${quizzes.length} quizzes; ${storedFlashcardBank.cards.length} flashcards across ${storedFlashcardBank.decks.length} decks for ${flashcardRepository.listSubjects().length} shared subjects.`);
