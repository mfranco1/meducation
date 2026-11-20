import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markdownIssues } from '../../src/content/validation/markdownValidation';
import {
  CURRENCY_NOTES,
  jaccard,
  normalize,
  retiredFindings,
  retiredTerms,
  weakSourceFindings,
  tokens,
  type Finding,
  type RetiredTerm,
} from './quiz-batch-report';

export interface FlashcardOutline {
  topics: {
    name: string;
    decks?: { name: string; cards?: { id: string; version: number; front: string; back: string }[] }[];
  }[];
}
export interface FlashcardPlan {
  topics: { name: string; decks?: { name: string; add?: number }[] }[];
}
interface NewCard {
  front: string;
  back: string;
  sources?: string;
}

const SEP = ' › ';
const FIELDS = ['front', 'back', 'sources'];
const key = (name: string) => name.trim().toLowerCase();
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const SOURCE_WORDS =
  /\b(handout|lecture notes?|reviewer|review center|trans(es)?|according to the (source|document|notes))\b/i;
const VAGUE_ATTRIBUTION =
  /\btextbooks\b|\(textbook\b|\btextbook\)|\btextbook (value|figure|cutoff|answer|definition|teaching)\b|\b(some|many|most|older) (studies|sources|authors|references|experts)\b|\b(many|hospital) series\b/i;
const FIELD_POLICY = { front: 'stem', back: 'rationale', sources: 'sources' } as const;

export function buildReport(
  value: unknown,
  {
    outline,
    plan,
    topic,
    retired = [],
  }: { outline: FlashcardOutline; plan?: FlashcardPlan; topic?: string; retired?: RetiredTerm[] },
) {
  const findings: Finding[] = [];
  const error = (where: string, message: string) => findings.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => findings.push({ level: 'warning', where, message });
  const shape = (message: string) => error('Batch shape', message);
  const excerpt = (front: string) => front.replace(/\s+/g, ' ').slice(0, 50);

  const outlineCards = new Map<string, { version: number; front: string; back: string; deck: string }>();
  const deckSizes = new Map<string, number>();
  for (const t of outline.topics)
    for (const d of t.decks ?? []) {
      const deck = `${t.name}${SEP}${d.name}`;
      deckSizes.set(key(deck), (d.cards ?? []).length);
      for (const c of d.cards ?? []) outlineCards.set(c.id, { ...c, deck });
    }

  const fieldIssues = (card: Record<string, unknown>, where: string, partial: boolean) => {
    for (const field of FIELDS) {
      const text = card[field];
      if (text === undefined) {
        if (!partial && field !== 'sources') error(where, `${field} is missing.`);
      } else if (typeof text !== 'string') error(where, `${field} must be a string.`);
      else if (!text.trim()) {
        if (field !== 'sources') error(where, `${field} is blank.`);
      } else
        for (const issue of markdownIssues(text, FIELD_POLICY[field as keyof typeof FIELD_POLICY], where))
          error(`${where}.${field}`, issue.message.replace(/^(stem|rationale)/, field));
    }
  };

  const added: { where: string; deck: string; card: NewCard }[] = [];
  const perDeck = new Map<string, number>();
  const touched = new Set<string>();
  const deleted: string[] = [];
  const edits: { id: string; version: number; card: Record<string, unknown> }[] = [];
  if (!isObject(value)) {
    shape('Batch must be an object.');
    return format(findings, []);
  }
  for (const name of Object.keys(value))
    if (!['topics', 'edits', 'deletes'].includes(name)) shape(`Unknown key "${name}".`);
  if (!['topics', 'edits', 'deletes'].some((name) => name in value)) shape('Batch needs topics, edits or deletes.');

  const topics = value.topics === undefined ? [] : value.topics;
  if (!Array.isArray(topics)) shape('topics must be an array.');
  else
    topics.forEach((t: unknown, ti) => {
      if (!isObject(t) || typeof t.name !== 'string' || !Array.isArray(t.decks))
        return shape(`topics[${ti}] needs a name and decks.`);
      for (const k of Object.keys(t))
        if (!['name', 'description', 'decks'].includes(k)) shape(`topics[${ti}] has unknown key "${k}".`);
      t.decks.forEach((d: unknown, di) => {
        if (!isObject(d) || typeof d.name !== 'string' || !Array.isArray(d.cards))
          return shape(`topics[${ti}].decks[${di}] needs a name and cards.`);
        for (const k of Object.keys(d))
          if (!['name', 'description', 'cards'].includes(k))
            shape(`topics[${ti}].decks[${di}] has unknown key "${k}".`);
        const deck = `${t.name}${SEP}${d.name}`;
        perDeck.set(deck, (perDeck.get(deck) ?? 0) + d.cards.length);
        touched.add(deck);
        d.cards.forEach((c: unknown, ci) => {
          const path = `${deck}${SEP}card ${ci + 1}`;
          if (!isObject(c)) return shape(`${path} must be an object.`);
          for (const k of Object.keys(c)) if (!FIELDS.includes(k)) shape(`${path} has unknown key "${k}".`);
          const where = typeof c.front === 'string' ? `${path} ("${excerpt(c.front)}")` : path;
          fieldIssues(c, where, false);
          if (typeof c.front === 'string' && typeof c.back === 'string')
            added.push({ where, deck, card: c as unknown as NewCard });
        });
      });
    });

  if (value.edits !== undefined && !Array.isArray(value.edits)) shape('edits must be an array.');
  else
    (value.edits ?? []).forEach((e: unknown, i: number) => {
      const path = `edits[${i}]`;
      if (!isObject(e) || typeof e.id !== 'string' || typeof e.version !== 'number')
        return shape(`${path} needs an id and a version.`);
      for (const k of Object.keys(e))
        if (!['id', 'version', ...FIELDS].includes(k)) shape(`${path} has unknown key "${k}".`);
      if (!FIELDS.some((f) => f in e)) return shape(`${path} changes no field.`);
      const where = `${path} (${e.id})`;
      fieldIssues(e, where, true);
      edits.push({ id: e.id, version: e.version, card: e });
      const known = outlineCards.get(e.id);
      if (!known) error(where, 'Card id is not in the outline.');
      else if (known.version !== e.version)
        error(where, `Version ${e.version} differs from the outline's ${known.version}.`);
    });

  if (value.deletes !== undefined && !Array.isArray(value.deletes)) shape('deletes must be an array.');
  else
    (value.deletes ?? []).forEach((d: unknown, i: number) => {
      const path = `deletes[${i}]`;
      if (!isObject(d) || typeof d.id !== 'string' || typeof d.version !== 'number')
        return shape(`${path} needs an id and a version.`);
      for (const k of Object.keys(d)) if (k !== 'id' && k !== 'version') shape(`${path} has unknown key "${k}".`);
      const known = outlineCards.get(d.id);
      if (!known) error(`${path} (${d.id})`, 'Card id is not in the outline.');
      else {
        if (known.version !== d.version)
          error(`${path} (${d.id})`, `Version ${d.version} differs from the outline's ${known.version}.`);
        deleted.push(d.id);
        touched.add(known.deck);
      }
    });

  // Duplicates. The pool holds earlier new fronts first, then the outline; new fronts compare once per pair.
  const pool = [
    ...added.map((a) => ({ where: a.where, front: a.card.front })),
    ...[...outlineCards.values()].map((c) => ({ where: `outline ${c.deck} ("${excerpt(c.front)}")`, front: c.front })),
  ].map((p) => ({ ...p, norm: normalize(p.front), tokens: tokens(p.front) }));
  added.forEach((a, i) => {
    const norm = normalize(a.card.front);
    const mine = pool[i].tokens;
    pool.forEach((other, j) => {
      if (j === i || (j < added.length && j > i)) return;
      if (other.norm === norm) error(a.where, `Duplicate front of ${other.where}.`);
      else if (jaccard(mine, other.tokens) >= 0.7) warn(a.where, `Near-duplicate front of ${other.where}.`);
    });
  });

  // Style warnings on new cards and on edited faces.
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const faces: { where: string; front?: string; back?: string; sources?: string }[] = [
    ...added.map((a) => ({ where: a.where, ...a.card })),
    ...edits.map((e) => ({
      where: `edits (${e.id})`,
      front: text(e.card.front),
      back: text(e.card.back),
      sources: text(e.card.sources),
    })),
  ];
  for (const { where, front, back, sources } of faces) {
    findings.push(
      ...retiredFindings(where, [front, back, sources], retired),
      ...weakSourceFindings(where, text(sources)),
    );
    if (front && front.length > 160) warn(where, `Front is ${front.length} characters; keep it to 160.`);
    if (back && back.length > 400 && !/^\s*\|.*\|\s*$/m.test(back))
      warn(where, `Back is ${back.length} characters; keep it to 400 or use a table.`);
    const nf = front ? normalize(front) : '';
    if (nf.length >= 20 && back && normalize(back).startsWith(nf)) warn(where, 'Back repeats the front.');
    if (front && SOURCE_WORDS.test(front)) warn(where, 'Front mentions source material.');
    if (back && SOURCE_WORDS.test(back)) warn(where, 'Back mentions source material.');
    if ([front, back].some((face) => face && VAGUE_ATTRIBUTION.test(face)))
      warn(where, 'Unnamed attribution ("textbook", "some studies"); name the guideline, textbook or study.');
  }

  // Deck size after this batch.
  for (const deck of touched) {
    const gone = deleted.filter((id) => outlineCards.get(id)?.deck === deck).length;
    const size = (deckSizes.get(key(deck)) ?? 0) - gone + (perDeck.get(deck) ?? 0);
    if (size < 15 || size > 80) warn(deck, `Deck would have ${size} cards; expected 15 to 80.`);
  }

  // Plan check.
  const planTopic = plan?.topics.find((t) => key(t.name) === key(topic ?? ''));
  if (planTopic && Array.isArray(topics) && topics.length) {
    const planned = new Map((planTopic.decks ?? []).map((d) => [key(d.name), d.add ?? 0]));
    for (const [deck, n] of perDeck) {
      const name = deck.split(SEP).slice(1).join(SEP);
      if (!planned.has(key(name))) warn(deck, 'Deck is not in the plan for this topic.');
      else if (planned.get(key(name)) !== n) warn(deck, `Plan adds ${planned.get(key(name))} cards; batch has ${n}.`);
    }
    for (const { name, add = 0 } of planTopic.decks ?? [])
      if (add > 0 && ![...perDeck.keys()].some((d) => key(d.split(SEP).slice(1).join(SEP)) === key(name)))
        warn(`${planTopic.name}${SEP}${name}`, `Plan adds ${add} cards; batch has 0.`);
  }

  const summary = [...perDeck].map(([deck, n]) => `${deck} +${n}`).join('; ') || 'no new cards';
  return format(findings, [`${summary} | ${edits.length} edits | ${deleted.length} deletes`]);
}

function format(findings: Finding[], summary: string[]) {
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const section = (title: string, list: Finding[]) =>
    list.length ? [`\n${title}`, ...list.map((f) => `  ${f.where}: ${f.message}`)] : [];
  const text = [
    'Flashcard batch report',
    ...section('Errors', errors),
    ...section('Warnings', warnings),
    `\n${summary.join(' ')} | ${errors.length} errors, ${warnings.length} warnings`,
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
  const planPath = option('--plan');
  const topic = option('--topic');
  const [batchPath] = args;
  if (!batchPath || !outlinePath) {
    console.error(
      'Usage: npm run report:flashcard-batch -- <batch.json> --outline <outline.json> [--plan <plan.json>] [--topic <name>]',
    );
    process.exit(2);
  }
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  const report = buildReport(read(batchPath), {
    outline: read(outlinePath),
    plan: planPath ? read(planPath) : undefined,
    topic,
    retired: retiredTerms(readFileSync(CURRENCY_NOTES, 'utf8')),
  });
  console.log(report.text);
  if (report.errors) process.exitCode = 1;
}
