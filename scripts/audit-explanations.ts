import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { questions } from '../src/content/questionBank.ts';

type Pattern = 'plain_prose' | 'bulleted' | 'choice_by_choice' | 'table_like' | 'heading' | 'source_disclosure';
const patternFor = (rationale: string, sources?: string): Pattern[] => {
  const patterns: Pattern[] = [];
  if (/^\s*(?:[-*+] |\d+[.)] )/m.test(rationale)) patterns.push('bulleted');
  if (/^\s*-\s+\*\*[A-D]\*\*/m.test(rationale)) patterns.push('choice_by_choice');
  if (/\b(?:TABLE|COLUMN|FUNCTION\s*\/\s*REMARKS)\b/i.test(rationale)) patterns.push('table_like');
  if (/^#{1,6}\s/m.test(rationale)) patterns.push('heading');
  if (sources) patterns.push('source_disclosure');
  return patterns.length ? patterns : ['plain_prose'];
};

const rows = questions.map(question => ({
  id: question.id,
  subjectId: question.subjectId,
  quizId: question.quizId,
  rationaleLength: question.rationale.length,
  patterns: patternFor(question.rationale, question.rationaleMeta?.sources),
  provenance: question.rationaleMeta?.provenance ?? null,
  hasSources: Boolean(question.rationaleMeta?.sources),
}));
const report = { generatedAt: new Date().toISOString(), totals: { questions: rows.length, withRationale: rows.filter(row => row.rationaleLength > 0).length, withSources: rows.filter(row => row.hasSources).length, aiReviewed: rows.filter(row => row.provenance === 'ai_draft_reviewed').length, answersUnderReview: questions.filter(question => question.rationaleMeta?.answerReviewNote).length }, rows };
writeFileSync(resolve('content/explanation-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Wrote audit for ${rows.length} questions; ${report.totals.withSources} have source disclosures; ${report.totals.answersUnderReview} answer keys need review.`);
