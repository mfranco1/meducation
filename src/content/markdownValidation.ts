import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type { Question } from '../domain/types';
import { allowedRawHtmlAttributes, isAllowedImageUrl, isAllowedLinkUrl, richHtmlTags, type RichContentField } from './richContentPolicy';
import type { ValidationIssue } from './validate';

type ContentField = RichContentField | 'sources';
type MarkdownNode = { type?: string; url?: string; alt?: string | null; value?: string; children?: MarkdownNode[] };

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const htmlTag = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
const htmlAttribute = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function attributeValue(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^['"]|['"]$/g, '');
}

function rawHtmlIssues(html: string, field: RichContentField, questionId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const match of html.matchAll(htmlTag)) {
    if (match[0].startsWith('</')) continue;
    const tagName = match[1].toLowerCase();
    if (!richHtmlTags.has(tagName)) {
      issues.push({ level: 'error', questionId, message: `${field} contains unsupported HTML element <${tagName}>` });
      continue;
    }
    const attributes = new Map<string, string>();
    const attributeText = match[2].replace(/\/\s*$/, '');
    for (const attribute of attributeText.matchAll(htmlAttribute)) {
      const name = attribute[1].toLowerCase();
      if (!name) continue;
      if (!allowedRawHtmlAttributes(tagName).has(name)) {
        issues.push({ level: 'error', questionId, message: `${field} contains unsupported <${tagName}> attribute ${name}` });
        continue;
      }
      attributes.set(name, attributeValue(attribute[2]));
    }
    if (tagName === 'a' && (!attributes.get('href') || !isAllowedLinkUrl(attributes.get('href')!))) {
      issues.push({ level: 'error', questionId, message: `${field} contains an unsupported link URL` });
    }
    if (tagName === 'img') {
      if (!attributes.get('alt')?.trim()) issues.push({ level: 'error', questionId, message: `${field} image requires non-empty alt text` });
      if (!attributes.get('src') || !isAllowedImageUrl(attributes.get('src')!)) issues.push({ level: 'error', questionId, message: `${field} contains an unsupported image URL` });
    }
  }
  return issues;
}

function markdownIssues(markdown: string, field: ContentField, questionId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rich = field !== 'sources';
  const visit = (node: MarkdownNode) => {
    if (node.type === 'html') {
      if (!rich) issues.push({ level: 'error', questionId, message: `${field} contains raw HTML` });
      else issues.push(...rawHtmlIssues(node.value ?? '', field, questionId));
    }
    if (node.type === 'image') {
      if (!rich) issues.push({ level: 'error', questionId, message: `${field} contains an image; images are not allowed in canonical content` });
      else {
        if (!node.alt?.trim()) issues.push({ level: 'error', questionId, message: `${field} image requires non-empty alt text` });
        if (!node.url || !isAllowedImageUrl(node.url)) issues.push({ level: 'error', questionId, message: `${field} contains an unsupported image URL` });
      }
    }
    if (node.type === 'link' && (!node.url || !isAllowedLinkUrl(node.url))) issues.push({ level: 'error', questionId, message: `${field} contains an unsupported link URL` });
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
    if (meta?.answerReviewNote) issues.push({ level: 'warning', questionId: question.id, message: `Answer under review: ${meta.answerReviewNote}` });
  }
  return issues;
}
