import type { Question, Quiz, Subject } from '../domain/types';
import type { StoredQuestionBank } from './schema';
export interface ValidationIssue { level: 'error' | 'warning'; message: string; questionId?: string }
export function validateQuestionBank(subjects: Subject[], quizzes: Quiz[], questions: Question[]): ValidationIssue[] {
 const issues: ValidationIssue[]=[]; const subjectIds=new Set<string>(); const quizById=new Map<string, Quiz>(); const seenQuestionIds=new Set<string>(); const closedQuizIds=new Set<string>(); let currentQuizId: string | undefined;
 subjects.forEach(subject => { if (!subject.id) issues.push({ level: 'error', message: 'Missing subject ID' }); else if (subjectIds.has(subject.id)) issues.push({ level: 'error', message: `Duplicate subject ID: ${subject.id}` }); else subjectIds.add(subject.id); });
 quizzes.forEach(quiz => { if (!quiz.id) issues.push({ level: 'error', message: 'Missing quiz ID' }); else if (quizById.has(quiz.id)) issues.push({ level: 'error', message: `Duplicate quiz ID: ${quiz.id}` }); else quizById.set(quiz.id, quiz); if (!subjectIds.has(quiz.subjectId)) issues.push({ level: 'error', message: `Quiz ${quiz.id} has an invalid subject reference` }); });
 questions.forEach(q=>{ const error=(message:string)=>issues.push({level:'error',message,questionId:q.id}); if(!q.id) error('Missing question ID'); else if(seenQuestionIds.has(q.id)) error('Duplicate question ID'); else seenQuestionIds.add(q.id); if(!q.stem.trim()) error('Empty stem'); if(!q.rationale?.trim()) error('Missing rationale Markdown'); if(!q.quizId||!quizById.has(q.quizId)) error('Invalid quiz reference'); if (currentQuizId && currentQuizId !== q.quizId) closedQuizIds.add(currentQuizId); if (closedQuizIds.has(q.quizId)) error('Questions for a quiz must be contiguous to preserve canonical order'); currentQuizId = q.quizId; if(q.choices.length<2||q.choices.some(c=>!c.id||!c.text.trim())) error('Missing or empty choices'); if(new Set(q.choices.map(c=>c.id)).size!==q.choices.length) error('Duplicate choice IDs'); const answer=q.verifiedAnswer??q.sourceAnswer; if(!answer||!q.choices.some(c=>c.id===answer)) error('Correct answer does not reference a choice'); if(q.metadata.difficulty && !['easy','medium','hard','unknown'].includes(q.metadata.difficulty)) error('Invalid difficulty'); if(q.choiceExplanations && Object.keys(q.choiceExplanations).some(id=>!q.choices.some(c=>c.id===id))) error('Choice explanation references unknown choice'); });
 quizzes.forEach(q=>{ if(!questions.some(question=>question.quizId===q.id)) issues.push({level:'error',message:`Quiz ${q.id} has no questions`}); }); return issues;
}

export function validateStoredQuestionBank(bank: StoredQuestionBank): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 if (bank.schemaVersion !== 3) issues.push({ level: 'error', message: `Unsupported question bank schema version: ${bank.schemaVersion}` });
 bank.subjects.forEach(subject => { if ('description' in subject) issues.push({ level: 'error', message: `Subject ${subject.id} stores a redundant description` }); });
 bank.quizzes.forEach(quiz => { if ('questionCount' in quiz) issues.push({ level: 'error', message: `Quiz ${quiz.id} stores a derived question count` }); });
 bank.questions.forEach(question => {
   const error = (message: string) => issues.push({ level: 'error', message, questionId: question.id });
   if ('subjectId' in question) error('Question stores a redundant subject reference');
   if ('questionNumber' in question) error('Question stores a derived array position');
   if ('answerSource' in question) error('Question stores a derived answer source');
   if (question.metadata) {
     if ('discipline' in question.metadata) error('Question metadata stores a duplicated discipline');
     if (question.metadata.difficulty === 'unknown') error('Question metadata stores a default difficulty');
     if (!Object.values(question.metadata).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))) error('Question stores an empty metadata object');
   }
 });
 return issues;
}
