import type { Question } from '../domain/types';
import type { ExplanationEnrichment } from './explanations';
import type { ValidationIssue } from './validate';

export function validateExplanationEnrichments(questions: Question[], enrichments: Record<string, ExplanationEnrichment>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(questions.map(question => [question.id, question]));
  for (const [questionId, entry] of Object.entries(enrichments)) {
    const question = byId.get(questionId);
    if (!question) { issues.push({ level: 'error', questionId, message: 'Explanation enrichment references an unknown question' }); continue; }
    if (!entry.markdown.trim()) issues.push({ level: 'error', questionId, message: 'Explanation enrichment is empty' });
    if (/<\/?[a-z][^>]*>/i.test(entry.markdown)) issues.push({ level: 'error', questionId, message: 'Explanation enrichment contains unsupported HTML' });
    if (!entry.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)) issues.push({ level: 'error', questionId, message: 'Explanation enrichment requires a review date' });
    if (!entry.reviewNote.trim()) issues.push({ level: 'error', questionId, message: 'Explanation enrichment requires a review note' });
    if (entry.provenance === 'ai_draft_reviewed' && question.rationale) issues.push({ level: 'error', questionId, message: 'AI-authored explanation is only valid when the source rationale is absent' });
    if (entry.provenance === 'source_formatted' && !question.rationale) issues.push({ level: 'error', questionId, message: 'Source-formatted explanation requires a source rationale' });
    if (entry.answerReviewNote) issues.push({ level: 'warning', questionId, message: `Source answer under review: ${entry.answerReviewNote}` });
  }
  for (const question of questions) {
    if (!question.rationale && !enrichments[question.id]) issues.push({ level: 'warning', questionId: question.id, message: 'Missing explanation; needs a reviewed development-time AI draft or source review' });
  }
  return issues;
}
