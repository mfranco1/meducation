import type { StoredFlashcardBank, StoredQuestionBank } from '../schema/schema';
import limits from './authoringLimits.json';
import { markdownIssues } from './markdownValidation';
import { validateQuestionBank, validateStoredQuestionBank, validateStoredFlashcardBank } from './validate';

export interface PolicyIssue {
  path: string;
  code: string;
  message: string;
}
export interface PolicyResult {
  policyVersion: number;
  totalIssues: number;
  truncated: boolean;
  issues: PolicyIssue[];
  warnings: number;
}
type Shape = { required: Record<string, Rule>; optional?: Record<string, Rule> };
type Rule = 'string' | 'number' | Shape | readonly [Rule] | { values: Rule };
const choice: Shape = { required: { id: 'string', text: 'string' } };
const question: Shape = {
  required: { id: 'string', quizId: 'string', stem: 'string', choices: [choice], rationale: 'string' },
  optional: {
    answer: 'string', verifiedAnswer: 'string', answerNote: 'string',
    rationaleMeta: { required: {}, optional: { sources: 'string', answerReviewNote: 'string', provenance: 'string', reviewedAt: 'string', reviewNote: 'string' } },
    choiceExplanations: { values: 'string' }, pearls: ['string'],
    metadata: { required: {}, optional: { topic: 'string', subtopic: 'string', system: 'string', difficulty: 'string', questionType: 'string', tags: ['string'] } },
  },
};
const pairShape: Shape = { required: {
  quizzes: { required: { schemaVersion: 'number', subjects: [{ required: { id: 'string', name: 'string', accent: 'string' } }], topics: [{ required: { id: 'string', subjectId: 'string', name: 'string' } }], quizzes: [{ required: { id: 'string', topicId: 'string', name: 'string' } }], questions: [question] } },
  flashcards: { required: { schemaVersion: 'number', decks: [{ required: { id: 'string', topicId: 'string', name: 'string' }, optional: { description: 'string' } }], cards: [{ required: { id: 'string', deckId: 'string', front: 'string', back: 'string' }, optional: { sources: 'string', reviewNote: 'string' } }] } },
} };
const knownKeys = new Set<string>();
function collectKeys(rule: Rule): void {
  if (typeof rule === 'string') return;
  if (Array.isArray(rule)) { collectKeys(rule[0]); return; }
  if ('required' in rule) {
    for (const [name, child] of Object.entries({ ...rule.required, ...rule.optional })) { knownKeys.add(name); collectKeys(child); }
  }
}
collectKeys(pairShape);
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Unknown input is checked before typed validators; accepted values are never rewritten. */
export function validateAuthoringPair(value: unknown): PolicyResult {
  const issues: PolicyIssue[] = [];
  let totalIssues = 0;
  let warnings = 0;
  const issue = (path: string, code: string, message: string) => {
    totalIssues++;
    if (issues.length < limits.maxIssues) issues.push({ path, code, message });
  };
  let nodes = 0;
  const resources = (item: unknown, path: string, depth: number) => {
    if (++nodes > limits.maxNodes) throw new Error('resource_limit');
    if (depth > limits.maxDepth) { issue(path, 'depth_limit', 'Content nesting exceeds the limit.'); return; }
    if (typeof item === 'string') {
      if (new TextEncoder().encode(item).length > limits.maxStringBytes) issue(path, 'string_limit', 'Text exceeds the field limit.');
      if (item.includes('\0')) issue(path, 'invalid_text', 'Text must not contain NUL.');
      if (/[\uD800-\uDFFF]/u.test(item)) issue(path, 'invalid_unicode', 'Text must contain valid Unicode.');
    } else if (typeof item === 'number' && !Number.isFinite(item)) issue(path, 'invalid_number', 'Numbers must be finite.');
    else if (Array.isArray(item)) {
      if (item.length > limits.maxArrayLength) { issue(path, 'array_limit', 'Collection exceeds the record limit.'); return; }
      item.forEach((child, index) => resources(child, `${path}[${index}]`, depth + 1));
    } else if (object(item)) {
      if (Object.keys(item).length > limits.maxObjectKeys) { issue(path, 'object_limit', 'Object exceeds the field limit.'); return; }
      for (const [key, child] of Object.entries(item)) {
        if (forbiddenKeys.has(key)) issue(path, 'dangerous_key', 'Reserved object keys are forbidden.');
        // Paths must never echo arbitrary submitted keys.
        resources(key, path, depth + 1);
        resources(child, knownKeys.has(key) ? `${path}.${key}` : path, depth + 1);
      }
    }
  };
  const shape = (item: unknown, rule: Rule, path: string): void => {
    if (typeof rule === 'string') {
      if (typeof item !== rule) issue(path, 'invalid_type', `Expected ${rule}.`);
    } else if (Array.isArray(rule)) {
      if (!Array.isArray(item)) issue(path, 'invalid_type', 'Expected an array.');
      else item.forEach((child, i) => shape(child, rule[0], `${path}[${i}]`));
    } else if (!object(item)) issue(path, 'invalid_type', 'Expected an object.');
    else if ('values' in rule) Object.values(item).forEach(child => shape(child, (rule as { values: Rule }).values, path));
    else {
      const schema = rule as Shape;
      const fields = { ...schema.required, ...schema.optional };
      for (const name of Object.keys(schema.required)) if (!(name in item)) issue(`${path}.${name}`, 'missing_field', 'Required field is missing.');
      for (const [name, child] of Object.entries(item)) {
        if (!Object.hasOwn(fields, name)) issue(path, 'unknown_field', 'Unknown field is forbidden.');
        else shape(child, fields[name], `${path}.${name}`);
      }
    }
  };
  const result = (): PolicyResult => ({ policyVersion: limits.policyVersion, totalIssues, truncated: totalIssues > issues.length, issues, warnings });
  try { resources(value, '$.pair', 0); } catch { issue('$.pair', 'node_limit', 'Content exceeds the node limit.'); }
  if (totalIssues) return result();
  shape(value, pairShape, '$.pair');
  if (totalIssues) return result();
  const pair = value as { quizzes: StoredQuestionBank; flashcards: StoredFlashcardBank };
  const bank = pair.quizzes;
  const questions = bank.questions.map(item => ({ ...item, metadata: item.metadata ?? {} }));
  for (const [path, found] of [
    ['$.pair.quizzes', [...validateStoredQuestionBank(bank), ...validateQuestionBank(bank.subjects, bank.topics, bank.quizzes, questions)]],
    ['$.pair.flashcards', validateStoredFlashcardBank(pair.flashcards, bank.topics)],
  ] as const) {
    for (const foundIssue of found) if (foundIssue.level === 'error') issue(path, 'stored_contract', 'Stored content violates schema, ordering, provenance or references.');
  }
  const markupCache = new Map<string, ReturnType<typeof markdownIssues>>();
  const markdown = (text: string, rich: boolean, path: string) => {
    const key = `${rich}:${text}`;
    let foundIssues = markupCache.get(key);
    if (!foundIssues) { foundIssues = markdownIssues(text, rich ? 'stem' : 'sources', ''); markupCache.set(key, foundIssues); }
    for (const found of foundIssues) {
      const code = found.message.includes('LaTeX') ? 'invalid_math' : found.message.includes('URL') ? 'unsafe_url' : found.message.includes('alt text') ? 'image_alt_required' : 'invalid_markup';
      issue(path, code, 'Content violates the field markup, URL or math policy.');
    }
  };
  bank.questions.forEach((item, index) => {
    const path = `$.pair.quizzes.questions[${index}]`;
    if (item.rationaleMeta?.answerReviewNote) warnings++;
    markdown(item.stem, true, `${path}.stem`); markdown(item.rationale, true, `${path}.rationale`);
    item.choices.forEach((entry, i) => markdown(entry.text, false, `${path}.choices[${i}].text`));
    if (item.rationaleMeta?.sources) markdown(item.rationaleMeta.sources, false, `${path}.rationaleMeta.sources`);
    if (item.rationaleMeta?.provenance === 'ai_draft_reviewed' && (!/^\d{4}-\d{2}-\d{2}$/.test(item.rationaleMeta.reviewedAt ?? '') || !item.rationaleMeta.reviewNote?.trim())) issue(`${path}.rationaleMeta`, 'review_provenance', 'Reviewed content requires a date and review note.');
    Object.values(item.choiceExplanations ?? {}).forEach(text => markdown(text, false, `${path}.choiceExplanations`));
    item.pearls?.forEach((text, i) => markdown(text, false, `${path}.pearls[${i}]`));
  });
  const siblingNames = new Set<string>();
  for (const deck of pair.flashcards.decks) {
    const key = JSON.stringify([deck.topicId, deck.name.trim().toLocaleLowerCase()]);
    if (siblingNames.has(key)) warnings++;
    siblingNames.add(key);
  }
  pair.flashcards.cards.forEach((item, i) => {
    const path = `$.pair.flashcards.cards[${i}]`;
    markdown(item.front, true, `${path}.front`); markdown(item.back, true, `${path}.back`);
    if (item.sources) markdown(item.sources, false, `${path}.sources`);
  });
  return result();
}
