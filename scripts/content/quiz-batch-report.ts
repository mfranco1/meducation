import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBulkAddDraft, type BulkAddItemDraft } from '../../src/admin/core/bulkAddDraft';
import { validateQuestionMarkdown } from '../../src/content/validation/markdownValidation';

export interface Vocabulary {
  system: string[];
  questionType: string[];
  difficulty: string[];
}
export interface Outline {
  topics: {
    name: string;
    subtopics?: string[];
    quizzes?: { name: string; questionCount?: number; stems?: string[] }[];
  }[];
}
export interface Blueprint {
  topics: { name: string; quizzes: { name: string; target: number; subtopics?: Record<string, number> }[] }[];
}
export interface Finding {
  level: 'error' | 'warning';
  where: string;
  message: string;
}
interface Entry {
  topic: string;
  quiz: string;
  item: BulkAddItemDraft;
  where: string;
}

const DIFFICULTY_TARGET = { easy: 20, medium: 60, hard: 20 };
const key = (name: string) => name.trim().toLowerCase();
const normalize = (stem: string) =>
  stem
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (stem: string) => new Set(normalize(stem).split(' '));
const jaccard = (a: Set<string>, b: Set<string>) => {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
};
const count = <T>(values: T[]) => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
};
const pct = (part: number, total: number) => Math.round((part / (total || 1)) * 100);

function entriesOf(draft: { topics: { name: string; quizzes: { name: string; items: BulkAddItemDraft[] }[] }[] }) {
  return draft.topics.flatMap((topic) =>
    topic.quizzes.flatMap((quiz) =>
      quiz.items.map((item, index): Entry => {
        const excerpt = item.stem.replace(/\s+/g, ' ').slice(0, 50);
        return {
          topic: topic.name,
          quiz: quiz.name,
          item,
          where: `${topic.name} › ${quiz.name} › item ${index + 1} ("${excerpt}")`,
        };
      }),
    ),
  );
}

function itemFindings({ item, where }: Entry, vocabulary: Vocabulary) {
  const out: Finding[] = [];
  const add = (level: Finding['level'], message: string) => out.push({ level, where, message });
  if (item.choices.length !== 4) add('error', `Has ${item.choices.length} choices; expected 4.`);
  if (new Set(item.choices.map(normalize)).size < item.choices.length) add('error', 'Duplicate choices.');
  for (const choice of item.choices) {
    if (/^\(?[A-Za-z][.)]\s/.test(choice.trim())) add('error', `Choice has a letter prefix: "${choice.slice(0, 30)}".`);
    if (/\b(all of the above|none of the above|both [A-D] and [A-D])\b/i.test(choice))
      add('error', `Choice uses a banned option: "${choice.slice(0, 30)}".`);
  }
  const { subtopic, system, difficulty, questionType } = item.metadata ?? {};
  if (!item.metadata) add('error', 'Missing metadata.');
  else
    for (const [name, value] of Object.entries({ subtopic, system, difficulty, questionType }))
      if (!value) add('error', `Missing metadata.${name}.`);
  if (difficulty && !vocabulary.difficulty.includes(difficulty))
    add('error', `Difficulty "${difficulty}" is not in the vocabulary.`);
  if (system && !vocabulary.system.includes(system)) add('warning', `System "${system}" is not in the vocabulary.`);
  if (questionType && !vocabulary.questionType.includes(questionType))
    add('warning', `Question type "${questionType}" is not in the vocabulary.`);
  const pearls = item.pearls?.length ?? 0;
  if (pearls < 1 || pearls > 3) add('error', `Has ${pearls} pearls; expected 1 to 3.`);

  const lengths = item.choices.map((choice) => choice.length);
  const correct = lengths[item.answer.charCodeAt(0) - 65] ?? 0;
  const others = lengths.filter((_, index) => index !== item.answer.charCodeAt(0) - 65);
  if (others.length && correct > Math.max(...others) * 1.3)
    add('warning', 'Correct choice is much longer than the others.');
  if (item.choices.some((choice) => /\b(always|never|only|all|none)\b/i.test(choice)))
    add('warning', 'A choice uses an absolute word.');
  if (/\b(EXCEPT|NOT|LEAST)\b/.test(item.stem)) add('warning', 'Stem uses a negative lead-in.');
  if (!item.stem.trim().endsWith('?')) add('warning', 'Stem does not end with a question mark.');

  const rationale = item.rationale;
  const prose = rationale.split('\n').filter((line) => !line.trim().startsWith('|')).join(' ');
  const words = prose.split(/\s+/).filter(Boolean).length;
  if (words < 70) add('warning', `Rationale is short (${words} words outside tables; aim for 70 to 140).`);
  if (words > 140) add('warning', `Rationale is long (${words} words outside tables; aim for 70 to 140).`);
  if (!/\*\*[^*\n]+\*\*/.test(rationale)) add('warning', 'Rationale has no bold text.');
  if (!/^\s*[-*] /m.test(rationale)) add('warning', 'Rationale has no bulleted list of the other choices.');
  const hasTable = /^\s*\|.*\|\s*$/m.test(rationale);
  if (questionType === 'Comparison' && !hasTable) add('warning', 'Comparison rationale has no table.');
  const widest = Math.max(0, ...[...rationale.matchAll(/^\s*\|(.*)\|\s*$/gm)].map((row) => row[1].split('|').length));
  if (widest > 4) add('warning', `Rationale table has ${widest} columns; keep it to 4 for phones.`);
  if (/\b(choice|option|answer) [A-D]\b|\([A-D]\)/i.test(rationale))
    add('warning', 'Rationale refers to a choice by letter.');
  return out;
}

function duplicateFindings(entries: Entry[], outlineStems: { where: string; stem: string }[]) {
  const out: Finding[] = [];
  const pool = [...entries.map((e) => ({ where: e.where, stem: e.item.stem })), ...outlineStems];
  entries.forEach((entry, i) => {
    const mine = tokens(entry.item.stem);
    // Pairs inside the batch are reported once; outline stems are always earlier.
    pool.forEach((other, j) => {
      if (j >= i && j < entries.length) return;
      if (j === i) return;
      const exact = normalize(other.stem) === normalize(entry.item.stem);
      if (exact || jaccard(mine, tokens(other.stem)) >= 0.8)
        out.push({
          level: exact ? 'error' : 'warning',
          where: entry.where,
          message: `${exact ? 'Duplicate' : 'Near-duplicate'} of ${other.where}.`,
        });
    });
  });
  return out;
}

function distribution(entries: Entry[]) {
  const letters = count(entries.map((e) => e.item.answer));
  const difficulty = count<string>(entries.map((e) => e.item.metadata?.difficulty ?? 'unset'));
  const types = count(entries.map((e) => e.item.metadata?.questionType ?? 'unset'));
  const fmt = (m: Map<string, number>) =>
    [...m]
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || '-';
  const deviations = Object.entries(DIFFICULTY_TARGET).filter(
    ([name, target]) => Math.abs(pct(difficulty.get(name) ?? 0, entries.length) - target) > 10,
  );
  return {
    deviations,
    text:
      `${entries.length} items | answers ${['A', 'B', 'C', 'D'].map((l) => `${l} ${letters.get(l) ?? 0}`).join(', ')}` +
      ` | difficulty ${fmt(difficulty)} (target easy 20 / medium 60 / hard 20 %)` +
      ` | types ${fmt(types)}`,
  };
}

function blueprintFindings(entries: Entry[], blueprint: Blueprint) {
  const out: Finding[] = [];
  const lines: string[] = [];
  const check = (where: string, label: string, actual: number, target: number) => {
    lines.push(`  ${where} ${label}: ${actual}/${target}`);
    if (Math.abs(actual - target) > target * 0.2)
      out.push({ level: 'warning', where, message: `${label}: actual ${actual}, target ${target}.` });
  };
  for (const topic of blueprint.topics)
    for (const quiz of topic.quizzes) {
      const where = `${topic.name} › ${quiz.name}`;
      const items = entries.filter((e) => key(e.topic) === key(topic.name) && key(e.quiz) === key(quiz.name));
      if (!items.length) {
        out.push({ level: 'warning', where, message: 'Quiz is in the blueprint but missing from the batch.' });
        continue;
      }
      check(where, 'items', items.length, quiz.target);
      for (const [name, target] of Object.entries(quiz.subtopics ?? {}))
        check(
          where,
          `subtopic "${name}"`,
          items.filter((e) => key(e.item.metadata?.subtopic ?? '') === key(name)).length,
          target,
        );
    }
  return { out, lines };
}

export function buildReport(
  value: unknown,
  { vocabulary, outline, blueprint }: { vocabulary: Vocabulary; outline?: Outline; blueprint?: Blueprint },
) {
  const parsed = parseBulkAddDraft(value, { kind: 'subject', subjectId: 'x' });
  const findings: Finding[] = parsed.errors.map((message) => ({ level: 'error', where: 'Batch shape', message }));
  const draft = parsed.draft && 'topics' in parsed.draft ? parsed.draft : undefined;
  if (!draft) return format(findings, []);

  const entries = entriesOf(draft);
  const outlineTopic = (name: string) => outline?.topics.find((t) => key(t.name) === key(name));
  const outlineStems = (outline?.topics ?? []).flatMap((topic) =>
    (topic.quizzes ?? []).flatMap((quiz) =>
      (quiz.stems ?? []).map((stem) => ({
        where: `outline ${topic.name} › ${quiz.name} ("${stem.slice(0, 50)}")`,
        stem,
      })),
    ),
  );
  entries.forEach((entry) => findings.push(...itemFindings(entry, vocabulary)));
  const questions = entries.map((entry, index) => ({
    id: String(index),
    quizId: entry.quiz,
    stem: entry.item.stem,
    choices: entry.item.choices.map((text, i) => ({ id: String.fromCharCode(65 + i), text })),
    answer: entry.item.answer,
    rationale: entry.item.rationale,
    rationaleMeta: entry.item.rationaleMeta,
    pearls: entry.item.pearls,
    metadata: {},
  }));
  for (const issue of validateQuestionMarkdown(questions))
    findings.push({ level: issue.level, where: entries[Number(issue.questionId)].where, message: issue.message });
  findings.push(...duplicateFindings(entries, outlineStems));

  const lines: string[] = [];
  const overall = distribution(entries);
  lines.push(`Overall: ${overall.text}`);
  if (overall.deviations.length)
    findings.push({ level: 'warning', where: 'Overall', message: 'Difficulty mix is off target.' });
  for (const topic of draft.topics) {
    lines.push(`\n${topic.name}`);
    const existing = (outlineTopic(topic.name)?.quizzes ?? []).filter(
      (q) => !topic.quizzes.some((b) => key(b.name) === key(q.name)),
    );
    if (blueprint && topic.quizzes.length + existing.length < 2)
      findings.push({ level: 'warning', where: topic.name, message: 'Topic has fewer than 2 quizzes.' });
    const subtopics = new Map<string, Set<string>>();
    for (const quiz of topic.quizzes) {
      const where = `${topic.name} › ${quiz.name}`;
      const quizEntries = entries.filter((e) => e.topic === topic.name && e.quiz === quiz.name);
      const dist = distribution(quizEntries);
      lines.push(`  ${quiz.name}: ${dist.text}`);
      if (quiz.items.length < 50 || quiz.items.length > 100)
        findings.push({ level: 'warning', where, message: `Quiz has ${quiz.items.length} items; expected 50 to 100.` });
      const types = count(quizEntries.map((e) => e.item.metadata?.questionType ?? ''));
      for (const [type, n] of types)
        if (type && pct(n, quizEntries.length) > (type === 'Recall' ? 30 : 40))
          findings.push({
            level: 'warning',
            where,
            message: `${type} is ${pct(n, quizEntries.length)}% of the quiz; keep Recall at 30% or less and other types at 40% or less.`,
          });
      for (const [name] of dist.deviations)
        findings.push({
          level: 'warning',
          where,
          message: `Difficulty share for ${name} is more than 10 points off target.`,
        });
      for (const e of quizEntries) {
        const sub = e.item.metadata?.subtopic;
        if (!sub) continue;
        const folded = sub.toLowerCase().replace(/\s+/g, '');
        subtopics.set(folded, (subtopics.get(folded) ?? new Set()).add(sub));
        const known = outlineTopic(topic.name)?.subtopics;
        if (known?.length && !known.some((k) => key(k) === key(sub)))
          findings.push({ level: 'warning', where: e.where, message: `Subtopic "${sub}" is not in the outline.` });
      }
    }
    for (const variants of subtopics.values())
      if (variants.size > 1)
        findings.push({
          level: 'warning',
          where: topic.name,
          message: `Subtopics differ only by case or spacing: ${[...variants].map((v) => `"${v}"`).join(', ')}.`,
        });
  }
  if (blueprint) {
    const result = blueprintFindings(entries, blueprint);
    findings.push(...result.out);
    lines.push('\nBlueprint (actual/target)', ...result.lines);
  }
  return format(findings, lines);
}

function format(findings: Finding[], summary: string[]) {
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const section = (title: string, list: Finding[]) =>
    list.length ? [`\n${title}`, ...list.map((f) => `  ${f.where}: ${f.message}`)] : [];
  const text = [
    'Quiz batch report',
    ...summary,
    ...section('Errors', errors),
    ...section('Warnings', warnings),
    `\n${errors.length} errors, ${warnings.length} warnings`,
  ].join('\n');
  return { text, errors: errors.length, warnings: warnings.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args.splice(at, 2)[1];
  };
  const outlinePath = option('--outline');
  const blueprintPath = option('--blueprint');
  const vocabularyPath = option('--vocabulary') ?? '.agents/skills/write-quizzes/vocabulary.json';
  const [batchPath] = args;
  if (!batchPath) {
    console.error('Usage: npm run report:quiz-batch -- <batch.json> [--outline f] [--blueprint f] [--vocabulary f]');
    process.exit(2);
  }
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  const report = buildReport(read(batchPath), {
    vocabulary: read(vocabularyPath),
    outline: outlinePath ? read(outlinePath) : undefined,
    blueprint: blueprintPath ? read(blueprintPath) : undefined,
  });
  console.log(report.text);
  if (report.errors) process.exitCode = 1;
}
