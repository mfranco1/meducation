import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import katex from 'katex';
import { Tokenizer, type Token } from 'parse5';
import type { Question } from '../../domain/types';
import { allowedRawHtmlAttributes, isAllowedImageUrl, isAllowedLinkUrl, richHtmlTags, type RichContentField } from '../richText/richContentPolicy';
import type { ValidationIssue } from './validate';
import { remarkMathPlugin } from '../richText/remarkMathPolicy';

type ContentField = RichContentField | 'sources';
type MarkdownNode = { type?: string; url?: string; alt?: string | null; value?: string; lang?: string | null; identifier?: string; children?: MarkdownNode[] };

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMathPlugin);
// parse5 decodes references and reports malformed/duplicate attributes before policy.
// Token callbacks preserve table/inline fragments that a repaired DOM may discard.
function rawHtmlIssues(html: string, field: RichContentField, questionId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (message: string) => issues.push({ level: 'error', questionId, message: `${field} ${message}` });
  const tag = (token: Token.TagToken, opening: boolean) => {
    const name = token.tagName;
    if (!richHtmlTags.has(name)) {
      if (opening) issue(`contains unsupported HTML element <${name}>`);
      return;
    }
    if (!opening) return;
    const attributes = new Map(token.attrs.map(attribute => [attribute.name, attribute.value]));
    for (const attribute of token.attrs) {
      if (!allowedRawHtmlAttributes(name).has(attribute.name)) issue(`contains unsupported <${name}> attribute ${attribute.name}`);
    }
    if (name === 'a' && (!attributes.get('href') || !isAllowedLinkUrl(attributes.get('href')!))) issue('contains an unsupported link URL');
    if (name === 'img') {
      if (!attributes.get('alt')?.trim()) issue('image requires non-empty alt text');
      if (!attributes.get('src') || !isAllowedImageUrl(attributes.get('src')!)) issue('contains an unsupported image URL');
      for (const dimension of ['width', 'height']) {
        if (attributes.has(dimension) && !/^[1-9]\d{0,3}$/.test(attributes.get(dimension)!)) issue('contains an invalid image dimension');
      }
    }
    if (name === 'input' && (attributes.get('type') !== 'checkbox' || !attributes.has('disabled')
      || ['disabled', 'checked'].some(key => attributes.has(key) && !['', key].includes(attributes.get(key)!)))) {
      issue('contains an interactive or invalid HTML input');
    }
  };
  const ignore = () => undefined;
  new Tokenizer({}, {
    onStartTag: token => tag(token, true), onEndTag: token => tag(token, false),
    onComment: ignore, onDoctype: () => issue('contains unsupported HTML doctype'),
    onEof: ignore, onCharacter: ignore, onNullCharacter: () => issue('contains malformed HTML'),
    onWhitespaceCharacter: ignore, onParseError: () => issue('contains malformed HTML'),
  }).write(html, true);
  return issues;
}

export function markdownIssues(markdown: string, field: ContentField, questionId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rich = field !== 'sources';
  const definitions = new Map<string, string>();
  const visit = (node: MarkdownNode) => {
    if (node.type === 'html') {
      if (!rich) issues.push({ level: 'error', questionId, message: `${field} contains raw HTML` });
      else issues.push(...rawHtmlIssues(node.value ?? '', field, questionId));
    }
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const url = definitions.get(node.identifier ?? '');
      visit({ ...node, type: node.type === 'linkReference' ? 'link' : 'image', url, children: undefined });
    }
    if ((node.type === 'inlineMath' || node.type === 'math' || (node.type === 'code' && node.lang === 'math')) && rich) {
      try {
        katex.renderToString(node.value ?? '', { throwOnError: true, trust: () => { issues.push({ level: 'error', questionId, message: `${field} contains invalid LaTeX: trusted extensions are forbidden` }); return false; }, maxSize: 10, maxExpand: 1000 });
      } catch {
        issues.push({ level: 'error', questionId, message: `${field} contains invalid LaTeX: unsupported expression` });
      }
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
    const tree = markdownParser.runSync(markdownParser.parse(markdown)) as MarkdownNode;
    const collect = (node: MarkdownNode) => {
      if (node.type === 'definition' && node.identifier && node.url && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
      node.children?.forEach(collect);
    };
    collect(tree);
    visit(tree);
  } catch {
    issues.push({ level: 'error', questionId, message: `${field} cannot be parsed as Markdown` });
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
    for (const choice of question.choices) issues.push(...markdownIssues(choice.text, 'sources', question.id));
    for (const text of question.pearls ?? []) issues.push(...markdownIssues(text, 'sources', question.id));
  }
  return issues;
}

export function validateFlashcardMarkdown(cards: Array<{ id: string; front: string; back: string; sources?: string }>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const card of cards) {
    if (typeof card.front === 'string' && card.front.trim()) issues.push(...markdownIssues(card.front, 'stem', card.id));
    if (typeof card.back === 'string' && card.back.trim()) issues.push(...markdownIssues(card.back, 'rationale', card.id));
    if (typeof card.sources === 'string' && card.sources.trim()) issues.push(...markdownIssues(card.sources, 'sources', card.id));
  }
  return issues;
}
