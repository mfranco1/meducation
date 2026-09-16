import enrichment from './explanationEnrichment.json';
import aiDrafts from './aiExplanations.json';
import type { Question } from '../domain/types';

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

const approvedDrafts = aiDrafts as { approvedAt: string; explanations: Record<string, { markdown: string; sources?: string; answerReviewNote?: string }> };
const enriched: Record<string, ExplanationEnrichment> = {
  ...(enrichment as ExplanationDataFile).explanations,
  ...Object.fromEntries(Object.entries(approvedDrafts.explanations).map(([id, draft]) => [id, {
    ...draft,
    provenance: 'ai_draft_reviewed' as const,
    reviewedAt: approvedDrafts.approvedAt,
    reviewNote: 'Development-time AI draft approved by the user.',
  }])),
};

const bullet = /^(?<indent>\s*)(?:[•●▪*-]|o)\s+(?<text>.+)$/;
const ordered = /^(?<indent>\s*)\d+[.)]\s+(?<text>.+)$/;
const choiceLabel = /^[A-D]$/;
const choiceStart = /^([A-D])(?:\s+(.+))?$/;

export function splitRationaleSources(source: string): { body: string; sources?: string } {
  const markers = [...source.matchAll(/\b(?:Sources?|References)\s*:/gi)];
  const marker = markers.at(-1);
  if (!marker || marker.index === undefined || marker.index < source.length * .4 || source[marker.index - 1] === '(') return { body: source };
  const body = source.slice(0, marker.index).trimEnd();
  const sources = source.slice(marker.index).trim();
  const linesAfterMarker = sources.split('\n').slice(1);
  if (sources.length > 1200 || linesAfterMarker.some(line => /^\s*(?:[•●▪]|o)\s+/.test(line) || /^\s*[A-Z][A-Z /()\-]{5,}\s*$/.test(line))) return { body: source };
  return body && sources ? { body, sources } : { body: source };
}

/**
 * Converts PDF layout breaks into paragraphs and lists without changing the
 * stored source rationale. It intentionally leaves table-like material as
 * paragraphs until it can be reviewed against the source PDF.
 */
function formatSourceRationaleCandidate(source: string, allowChoices = true): string {
  const lines = source.replace(/\r/g, '').split('\n').filter(line => line.trim());
  const labeled = lines.map(line => choiceStart.exec(line.trim())?.[1]).filter((label): label is string => Boolean(label));
  const choiceMode = allowChoices && labeled.slice(0, 4).join('') === 'ABCD';
  if (choiceMode) {
    const sections: string[] = [];
    const opening: string[] = [];
    const trailing: string[] = [];
    let label = '';
    let content: string[] = [];
    let inTrailing = false;
    const flushChoice = () => {
      if (label) sections.push(`- **${label}** ${content.join(' ').trim()}`.trim());
      content = [];
    };
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (label === 'D' && /^(?:[•●▪]|\d+[.)])\s+/.test(line)) {
        flushChoice();
        label = '';
        inTrailing = true;
      }
      if (inTrailing) { trailing.push(rawLine); continue; }
      const match = choiceStart.exec(line);
      if (match && (label ? match[1].charCodeAt(0) === label.charCodeAt(0) + 1 : match[1] === 'A')) {
        flushChoice();
        label = match[1];
        if (match[2]) content.push(match[2]);
      } else if (label) content.push(line);
      else opening.push(line);
    }
    flushChoice();
    return [opening.length ? formatSourceRationaleCandidate(opening.join('\n'), false) : '', sections.join('\n'), trailing.length ? formatSourceRationaleCandidate(trailing.join('\n'), false) : ''].filter(Boolean).join('\n\n');
  }
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

export function formatSourceRationale(source: string): string {
  const candidate = formatSourceRationaleCandidate(source);
  return normalizedExplanationText(source) === normalizedExplanationText(candidate) ? candidate : formatSourceRationaleCandidate(source, false);
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
  const { body, sources } = splitRationaleSources(source);
  return normalizedExplanationText(source) === normalizedExplanationText([formatSourceRationale(body), sources ?? ''].filter(Boolean).join('\n'));
}

export function explanationFor(question: Question): ExplanationEnrichment | undefined {
  const entry = enriched[question.id];
  if (entry) return entry;
  if (!question.rationale) return undefined;
  const { body, sources } = splitRationaleSources(question.rationale);
  return { markdown: formatSourceRationale(body), sources, provenance: 'source_formatted', reviewedAt: '', reviewNote: 'Formatted automatically from the PDF-derived rationale.' };
}

export const explanationEnrichments = enriched;
