import aiDrafts from './aiExplanations.json';
import enrichment from './explanationEnrichment.json';
import type { Question } from '../domain/types';
import { formatSourceRationale, splitRationaleSources } from './sourceRationale';
import type { ExplanationDataFile, ExplanationEnrichment } from './explanationTypes';

const approvedDrafts = aiDrafts as { approvedAt: string; explanations: Record<string, { markdown: string; sources?: string; answerReviewNote?: string }> };
export const explanationEnrichments: Record<string, ExplanationEnrichment> = {
  ...(enrichment as ExplanationDataFile).explanations,
  ...Object.fromEntries(Object.entries(approvedDrafts.explanations).map(([id, draft]) => [id, { ...draft, provenance: 'ai_draft_reviewed' as const, reviewedAt: approvedDrafts.approvedAt, reviewNote: 'Development-time AI draft approved by the user.' }])),
};

export function explanationFor(question: Question): ExplanationEnrichment | undefined {
  const entry = explanationEnrichments[question.id];
  if (entry) return entry;
  if (!question.rationale) return undefined;
  const { body, sources } = splitRationaleSources(question.rationale);
  return { markdown: formatSourceRationale(body), sources, provenance: 'source_formatted', reviewedAt: '', reviewNote: 'Formatted automatically from the PDF-derived rationale.' };
}
