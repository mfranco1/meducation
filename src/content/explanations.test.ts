import { describe, expect, it } from 'vitest';
import { explanationFor } from './explanationCatalog';
import { parseExplanation } from './explanationParser';
import { formatSourceRationale, preservesSourceRationale, splitRationaleSources } from './sourceRationale';

describe('explanation formatting', () => {
  it('joins soft breaks and retains bullet structure', () => {
    expect(formatSourceRationale('First line\ncontinues.\n• First point\n• Second point')).toBe('First line continues.\n\n- First point\n- Second point');
  });

  it('parses only paragraphs and lists', () => {
    expect(parseExplanation('Opening **point**.\n\n- First\n- Second')).toEqual([
      { type: 'paragraph', text: 'Opening **point**.' },
      { type: 'list', ordered: false, items: [{ text: 'First' }, { text: 'Second' }] },
    ]);
  });

  it('keeps one level of nested list structure', () => {
    expect(parseExplanation('- Parent\n  - Child')).toEqual([
      { type: 'list', ordered: false, items: [{ text: 'Parent', children: [{ type: 'list', ordered: false, items: [{ text: 'Child' }] }] }] },
    ]);
  });

  it('preserves source words and punctuation when converting layout', () => {
    expect(preservesSourceRationale('A\n• IL-8: neutrophil chemotaxis\nwith no claim changes.')).toBe(true);
  });

  it('groups choice discussions into separate list items', () => {
    const source = 'A First choice\ncontinued\nB\nSecond choice\nC Third choice\nD Fourth choice';
    expect(formatSourceRationale(source)).toBe('- **A** First choice continued\n- **B** Second choice\n- **C** Third choice\n- **D** Fourth choice');
    expect(preservesSourceRationale(source)).toBe(true);
  });

  it('separates trailing references while retaining their text', () => {
    expect(splitRationaleSources('A long explanation of the finding. Sources:\n(1) Book, p. 12.')).toEqual({ body: 'A long explanation of the finding.', sources: 'Sources:\n(1) Book, p. 12.' });
  });

  it('keeps teaching content visible when it follows an internal source citation', () => {
    const source = 'Clinical explanation of the finding. Source: Book, p. 12.\n• Further teaching point';
    expect(splitRationaleSources(source)).toEqual({ body: source });
  });

  it('selects an automatically formatted source rationale when no enrichment exists', () => {
    const explanation = explanationFor({ id: 'fixture', subjectId: 's', quizId: 'q', stem: 'Stem', choices: [], answerSource: 'provided_key', rationale: 'First line\ncontinues.', metadata: {} });
    expect(explanation).toMatchObject({ markdown: 'First line continues.', provenance: 'source_formatted' });
  });
});
