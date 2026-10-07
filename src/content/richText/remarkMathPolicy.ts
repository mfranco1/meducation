import type { Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';

/**
 * Dollar amounts with magnitude suffixes are common in prose. remark-math
 * greedily pairs the first and next dollar, so `$500B; prose $100B` would
 * otherwise turn the intervening prose into a formula. Restore those bounded
 * money spans to literal source text. Explicit operators/TeX remain math.
 */
export const remarkMathPlugin: Plugin<[], Root> = function mathWithCurrency() {
  remarkMath.call(this, { singleDollarTextMath: true });
  return tree => {
    visit(tree, ['inlineMath', 'math'], (node, index, parent) => {
      if (index === undefined || !parent || !node.position) return;
      const value = (node as RootContent & { value: string }).value;
      const currencyAmount = /^\s*\d[\d,]*(?:\.\d+)?\s*(?:[KMBT]\b)?/i.test(value);
      const magnitudeAmount = /^\s*\d[\d,]*(?:\.\d+)?\s*[KMBT]\b/i.test(value);
      const proseCurrency = currencyAmount && /(?:[;:]\s+|\s+(?:its|the|and|citizens|people|revenue|income|per|each|costs?|price|paid|earned|abroad|budget|dollars)\b)/i.test(value);
      const danglingCurrencyOperation = magnitudeAmount && /(?:\+|=|,|\bto)\s*$/.test(value);
      if (proseCurrency || danglingCurrencyOperation) {
        const raw = node.type === 'math' ? `$$\n${value}\n$$` : `$${value}$`;
        parent.children[index] = { type: 'text', value: raw, position: node.position };
      }
    });
  };
};
