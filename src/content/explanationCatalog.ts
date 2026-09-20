import type { Question } from '../domain/types';
import { formatSourceRationale, splitRationaleSources } from './sourceRationale';
import type { QuestionExplanation } from './explanationTypes';

export function explanationFor(question: Question): QuestionExplanation | undefined {
  if (question.explanation) return question.explanation;
  if (!question.rationale) return undefined;
  const { body, sources } = splitRationaleSources(question.rationale);
  return { markdown: formatSourceRationale(body), sources, provenance: 'source_formatted', reviewedAt: '', reviewNote: 'Formatted automatically from the stored rationale.' };
}
