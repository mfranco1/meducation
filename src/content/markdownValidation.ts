import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type { Question } from '../domain/types';
import type { ValidationIssue } from './validate';

type MarkdownNode = { type?: string; url?: string; children?: MarkdownNode[] };

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const safeUrl = /^(?:https?:|mailto:)/i;

function markdownIssues(markdown: string, field: 'stem' | 'rationale' | 'sources', questionId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === 'html') issues.push({ level: 'error', questionId, message: `${field} contains raw HTML` });
    if (node.type === 'image') issues.push({ level: 'error', questionId, message: `${field} contains an image; images are not allowed in canonical content` });
    if (node.type === 'link' && (!node.url || !safeUrl.test(node.url))) issues.push({ level: 'error', questionId, message: `${field} contains an unsupported link URL` });
    node.children?.forEach(visit);
  };
  try {
    visit(markdownParser.parse(markdown) as MarkdownNode);
  } catch (error) {
    issues.push({ level: 'error', questionId, message: `${field} cannot be parsed as Markdown: ${error instanceof Error ? error.message : 'unknown error'}` });
  }
  return issues;
}

export function validateQuestionMarkdown(questions: Question[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const question of questions) {
    if (!question.stem.trim()) continue;
    issues.push(...markdownIssues(question.stem, 'stem', question.id));
    if (!question.rationale.trim()) {
      issues.push({ level: 'error', questionId: question.id, message: 'Missing rationale Markdown' });
      continue;
    }
    issues.push(...markdownIssues(question.rationale, 'rationale', question.id));
    if (question.rationaleMeta?.sources) issues.push(...markdownIssues(question.rationaleMeta.sources, 'sources', question.id));
    const meta = question.rationaleMeta;
    if (meta?.provenance === 'ai_draft_reviewed') {
      if (!meta.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewedAt)) issues.push({ level: 'error', questionId: question.id, message: 'AI-reviewed rationale requires a review date' });
      if (!meta.reviewNote?.trim()) issues.push({ level: 'error', questionId: question.id, message: 'AI-reviewed rationale requires a review note' });
    }
    if (meta?.answerReviewNote) issues.push({ level: 'warning', questionId: question.id, message: `Source answer under review: ${meta.answerReviewNote}` });
  }
  return issues;
}
