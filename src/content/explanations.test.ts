import { describe, expect, it } from 'vitest';
import { formatSourceRationale, parseExplanation, preservesSourceRationale } from './explanations';

describe('explanation formatting', () => {
  it('joins PDF soft breaks and retains bullet structure', () => {
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
});
