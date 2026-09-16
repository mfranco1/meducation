import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { explanationEnrichments, formatSourceRationale, preservesSourceRationale } from '../src/content/explanations.ts';
import { questions } from '../src/content/questionBank.ts';

type Pattern = 'plain_prose' | 'bulleted' | 'choice_by_choice' | 'table_like' | 'possible_spillover' | 'missing';
const patternFor = (rationale?: string): Pattern[] => {
  if (!rationale) return ['missing'];
  const patterns: Pattern[] = [];
  if (/^\s*(?:[•●▪]|o\s)/m.test(rationale)) patterns.push('bulleted');
  if (/^\s*[A-D]\s*$/m.test(rationale)) patterns.push('choice_by_choice');
  if (/\b(?:TABLE|COLUMN|FUNCTION\s*\/\s*REMARKS)\b/i.test(rationale)) patterns.push('table_like');
  if (/^\d{1,3}\.\s+Which\b/m.test(rationale)) patterns.push('possible_spillover');
  return patterns.length ? patterns : ['plain_prose'];
};

const rows = questions.map(question => ({
  id: question.id,
  subjectId: question.subjectId,
  quizId: question.quizId,
  sourcePdf: question.source.pdfFile,
  sourceLength: question.rationale?.length ?? 0,
  patterns: patternFor(question.rationale),
  enrichment: explanationEnrichments[question.id]?.provenance ?? null,
  formattedLength: question.rationale ? formatSourceRationale(question.rationale).length : explanationEnrichments[question.id]?.markdown.length ?? 0,
  preservesSource: question.rationale ? preservesSourceRationale(question.rationale) : null,
}));
const report = { generatedAt: new Date().toISOString(), totals: { questions: rows.length, withSourceRationale: rows.filter(row => row.sourceLength > 0).length, enriched: rows.filter(row => row.enrichment).length, missingSourceRationale: rows.filter(row => row.patterns.includes('missing')).length, withoutExplanation: rows.filter(row => row.patterns.includes('missing') && !row.enrichment).length, answersUnderReview: Object.values(explanationEnrichments).filter(entry => entry.answerReviewNote).length, sourcePreservationFailures: rows.filter(row => row.preservesSource === false).length }, rows };
writeFileSync(resolve('content/explanation-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Wrote audit for ${rows.length} questions; ${report.totals.withoutExplanation} remain without an explanation; ${report.totals.answersUnderReview} answer keys need review.`);
