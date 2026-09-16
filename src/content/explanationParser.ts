import type { ExplanationBlock } from './explanationTypes';

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
      const ordered = Boolean(numbered);
      if (listOrdered !== undefined && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      const item = { text: (unordered ?? numbered)![1].trim() };
      if (indent > 0 && listItems.length) {
        const parent = listItems[listItems.length - 1];
        const lastChild = parent.children?.at(-1);
        if (lastChild?.type === 'list' && lastChild.ordered === ordered) lastChild.items.push(item);
        else parent.children = [...(parent.children ?? []), { type: 'list', ordered, items: [item] }];
      } else listItems.push(item);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
