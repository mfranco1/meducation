import { readFileSync } from 'node:fs';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../src/content/schema/schema';
import { validateFlashcardBank } from '../../src/content/validation/flashcardValidation';
import { validateQuestionMarkdown } from '../../src/content/validation/markdownValidation';
import { validateQuestionBank, validateStoredQuestionBank } from '../../src/content/validation/validate';

// The operator first runs strict Python parsing; this gate never imports bundled banks.
try {
  const [quizPath, flashcardPath] = process.argv.slice(2);
  if (!quizPath || !flashcardPath || process.argv.length !== 4) {
    console.error(
      'Provide an explicit pair: npm run validate:content -- <quiz-file> <flashcard-file>. For current database content, validate a fresh selected export.',
    );
    throw new Error('Expected paired inputs');
  }
  const bank = JSON.parse(readFileSync(quizPath, 'utf8')) as StoredQuestionBank;
  const flashcards = JSON.parse(readFileSync(flashcardPath, 'utf8')) as StoredFlashcardBank;
  const questions = bank.questions.map((question) => ({ ...question, metadata: question.metadata ?? {} }));
  const issues = [
    ...validateStoredQuestionBank(bank),
    ...validateQuestionBank(bank.subjects, bank.topics, bank.quizzes, questions),
    ...validateQuestionMarkdown(questions),
    ...validateFlashcardBank(flashcards, bank.topics),
  ];
  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.filter((issue) => issue.level === 'warning').length;
  console.log(JSON.stringify({ errors, warnings }));
  if (errors) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ errors: 1, warnings: 0 }));
  process.exitCode = 1;
}
