export type ExplanationProvenance = 'source_formatted' | 'ai_draft_reviewed';

export interface ExplanationEnrichment {
  markdown: string;
  sources?: string;
  answerReviewNote?: string;
  provenance: ExplanationProvenance;
  reviewedAt: string;
  reviewNote: string;
}

export interface ExplanationDataFile {
  explanations: Record<string, ExplanationEnrichment>;
}

export type ExplanationBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: Array<{ text: string; children?: ExplanationBlock[] }> };
