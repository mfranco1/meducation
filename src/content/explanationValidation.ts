import type { Question } from '../domain/types';
import type { ValidationIssue } from './validate';

export function validateQuestionExplanations(questions: Question[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const question of questions) {
    const entry = question.explanation;
    if (!entry) {
      if (!question.rationale) issues.push({ level: 'warning', questionId: question.id, message: 'Missing explanation; add reviewed explanation content or a rationale' });
      continue;
    }
    const questionId = question.id;
    if (!entry.markdown.trim()) issues.push({ level: 'error', questionId, message: 'Explanation enrichment is empty' });
    if (/<\/?[a-z][^>]*>/i.test(entry.markdown)) issues.push({ level: 'error', questionId, message: 'Explanation enrichment contains unsupported HTML' });
    if (!entry.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)) issues.push({ level: 'error', questionId, message: 'Explanation enrichment requires a review date' });
    if (!entry.reviewNote.trim()) issues.push({ level: 'error', questionId, message: 'Explanation enrichment requires a review note' });
    if (entry.provenance === 'ai_draft_reviewed' && question.rationale) issues.push({ level: 'error', questionId, message: 'AI-authored explanation is only valid when the source rationale is absent' });
    if (entry.provenance === 'source_formatted' && !question.rationale) issues.push({ level: 'error', questionId, message: 'Source-formatted explanation requires a source rationale' });
    if (entry.answerReviewNote) issues.push({ level: 'warning', questionId, message: `Source answer under review: ${entry.answerReviewNote}` });
  }
  return issues;
}
