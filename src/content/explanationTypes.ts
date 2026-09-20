import type { ExplanationProvenance, QuestionExplanation } from '../domain/types';

export type { ExplanationProvenance, QuestionExplanation };

export type ExplanationBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; children?: ExplanationBlock[] }> };
