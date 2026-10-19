import type { Question } from './types';

// Store only on active attempts. A short hash keeps question text out of browser storage and backups;
// collisions are accidental-only (cyrb53, 53 bits) and would at worst resume an attempt on edited content.
export function contentSignature(questions: Question[]): string {
  return cyrb53(JSON.stringify(questions.map(question => [
    question.id,
    question.stem,
    question.choices.map(choice => [choice.id, choice.text]),
    question.answer,
  ])));
}

function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
