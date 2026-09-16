import enrichment from './explanationEnrichment.json';
import type { Question } from '../domain/types';

export type ExplanationProvenance = 'source_formatted' | 'ai_draft_reviewed';

export interface ExplanationEnrichment {
  markdown: string;
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

const enriched = (enrichment as ExplanationDataFile).explanations;

const bullet = /^(?<indent>\s*)(?:[•●▪*-]|o)\s+(?<text>.+)$/;
const ordered = /^(?<indent>\s*)\d+[.)]\s+(?<text>.+)$/;
const choiceLabel = /^[A-D]$/;

/**
 * Converts PDF layout breaks into paragraphs and lists without changing the
 * stored source rationale. It intentionally leaves table-like material as
 * paragraphs until it can be reviewed against the source PDF.
 */
export function formatSourceRationale(source: string): string {
  const lines = source.replace(/\r/g, '').split('\n').filter(line => line.trim());
  const result: string[] = [];
  let prose: string[] = [];
  let previousWasList = false;
  const append = (line: string, isList = false) => {
    if (result.length && !(isList && previousWasList)) result.push('');
    result.push(line);
    previousWasList = isList;
  };
  const flush = () => { if (prose.length) append(prose.join(' ')); prose = []; };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^[•●▪]$/.test(line)) continue;
    const list = bullet.exec(line) ?? ordered.exec(line);
    if (list?.groups?.text) {
      flush();
      const marker = ordered.test(line) ? '1.' : '-';
      const nested = /^\s*o\s+/.test(line) ? '  ' : '';
      append(`${nested}${marker} ${list.groups.text}`, true);
      continue;
    }
    if (choiceLabel.test(line)) {
      flush();
      append(`**${line}**`);
      continue;
    }
    prose.push(line);
  }
  flush();
  return result.join('\n');
}

/** Parses the deliberately small Markdown subset documented in question-schema.md. */
export function parseExplanation(markdown: string): ExplanationBlock[] {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const blocks: ExplanationBlock[] = [];
  let paragraph: string[] = [];
  let listItems: Array<{ text: string; children?: ExplanationBlock[] }> = [];
  let listOrdered: boolean | undefined;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() }); paragraph = []; };
  const flushList = () => { if (listItems.length && listOrdered !== undefined) blocks.push({ type: 'list', ordered: listOrdered, items: listItems }); listItems = []; listOrdered = undefined; };

  for (const rawLine of lines) {
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const line = rawLine.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || numbered) {
      flushParagraph();
      const isOrdered = Boolean(numbered);
      if (listOrdered !== undefined && listOrdered !== isOrdered) flushList();
      listOrdered = isOrdered;
      const item = { text: (unordered ?? numbered)![1].trim() };
      if (indent > 0 && listItems.length) {
        const parent = listItems[listItems.length - 1];
        const lastChild = parent.children?.at(-1);
        if (lastChild?.type === 'list' && lastChild.ordered === isOrdered) lastChild.items.push(item);
        else parent.children = [...(parent.children ?? []), { type: 'list', ordered: isOrdered, items: [item] }];
      } else listItems.push(item);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph(); flushList();
  return blocks;
}

/** Normalizes only documented layout syntax for source-preservation checks. */
export function normalizedExplanationText(text: string): string {
  return text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(line => !/^[•●▪]$/.test(line)).map(line => line
    .replace(/^(?:[•●▪*-]|o|\d+[.)])\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function preservesSourceRationale(source: string): boolean {
  return normalizedExplanationText(source) === normalizedExplanationText(formatSourceRationale(source));
}

export function explanationFor(question: Question): ExplanationEnrichment | undefined {
  const entry = enriched[question.id];
  if (entry) return entry;
  if (!question.rationale) return undefined;
  return { markdown: formatSourceRationale(question.rationale), provenance: 'source_formatted', reviewedAt: '', reviewNote: 'Formatted automatically from the PDF-derived rationale.' };
}

export const explanationEnrichments = enriched;
