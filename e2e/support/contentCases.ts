import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredQuestionBank } from '../../src/content/schema/schema';

type Item = StoredQuestionBank['questions'][number];
export interface ContentCase {
  label: string;
  item: Item;
  subject: StoredQuestionBank['subjects'][number];
  quiz: StoredQuestionBank['quizzes'][number];
}

const subject = { id: 's1', name: 'Content acceptance', accent: '#b9511b' };
const quiz = { id: 'q1', subjectId: 's1', name: 'Rich content acceptance' };
const synthetic: ContentCase[] = [
  {
    label: 'synthetic-rich',
    subject,
    quiz,
    item: {
      id: 'i1',
      quizId: 'q1',
      stem: 'Synthetic units: 140/90 mmHg, 37 °C, μg/mL and H<sub>2</sub>O. Inline $x^2$.\n\n- First detail\n- Second detail\n\n| Measure | Value |\n| --- | --- |\n| Pressure | 140 mmHg |\n\n$$\nV_A=(V_T-V_D)\\times RR\n$$',
      choices: [
        { id: 'A', text: '**Long choice** ' + 'with units μg/mL and deliberate wrapping. '.repeat(12) },
        { id: 'B', text: 'Short choice' },
      ],
      answer: 'A',
      answerNote: '',
      rationale: 'Explanation with **emphasis** and $\\frac{1}{2}$.',
      choiceExplanations: { A: 'A bounded explanation.', B: 'Another explanation.' },
      pearls: ['Synthetic pearl.'],
    },
  },
  {
    label: 'synthetic-hostile',
    subject,
    quiz,
    item: {
      id: 'i2',
      quizId: 'q1',
      stem: 'Safe text. <script>window.__rcExecuted=true</script><img src="javascript:window.__rcExecuted=true" onerror="window.__rcExecuted=true" alt="unsafe">\n\n[unsafe](javascript:window.__rcExecuted=true)\n\n$\\href{javascript:alert(1)}{blocked}$',
      choices: [
        { id: 'A', text: 'First' },
        { id: 'B', text: 'Second' },
      ],
      answer: 'A',
      rationale: 'Safe rationale.',
    },
  },
];

export function contentCases(): ContentCase[] {
  const directory = process.env.MEDUCATION_RC_EXPORT_DIRECTORY;
  if (!directory) return synthetic;
  const raw = readFileSync(join(directory, 'questionBank.json'));
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (
    manifest.manifestVersion !== 1 ||
    createHash('sha256').update(raw).digest('hex') !== manifest.artifactsSha256.quiz
  ) {
    throw new Error('Selected candidate export bytes differ from its operator manifest');
  }
  const bank = JSON.parse(raw.toString('utf8')) as StoredQuestionBank;
  const selected = new Set<Item>();
  const add = (item: Item | undefined) => {
    if (item) selected.add(item);
  };
  add(bank.questions.find((q) => /\$/.test(q.stem + q.rationale)));
  add(bank.questions.find((q) => /<\/?(?:sub|sup|b|i)>/.test(q.stem + q.rationale)));
  add(bank.questions.find((q) => /\n\s*[-*]\s|\|.*\|/.test(q.stem + q.rationale)));
  add(
    [...bank.questions].sort(
      (a, b) => Math.max(...b.choices.map((c) => c.text.length)) - Math.max(...a.choices.map((c) => c.text.length)),
    )[0],
  );
  add(bank.questions.find((q) => q.verifiedAnswer !== undefined));
  return [
    ...synthetic,
    ...[...selected].map((item, index) => {
      const quiz = bank.quizzes.find((q) => q.id === item.quizId)!;
      return {
        label: `selected-export-${index + 1}`,
        item,
        quiz,
        subject: bank.subjects.find((s) => s.id === quiz.subjectId)!,
      };
    }),
  ];
}
