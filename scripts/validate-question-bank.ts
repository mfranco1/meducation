import { questions, quizzes, schemaVersion, subjects } from '../src/content/questionBank.ts';
import { validateQuestionExplanations } from '../src/content/explanationValidation.ts';
import { validateQuestionBank } from '../src/content/validate.ts';

const issues = [
  ...(schemaVersion === 1 ? [] : [{ level: 'error' as const, message: `Unsupported question bank schema version: ${schemaVersion}` }]),
  ...validateQuestionBank(subjects, quizzes, questions),
  ...validateQuestionExplanations(questions),
];
issues.forEach(issue => console.log(`${issue.level.toUpperCase()}${issue.questionId ? ` [${issue.questionId}]` : ''}: ${issue.message}`));
if (issues.some(issue => issue.level === 'error')) process.exitCode = 1;
else console.log(`Question bank valid: ${questions.length} questions across ${quizzes.length} quizzes.`);
