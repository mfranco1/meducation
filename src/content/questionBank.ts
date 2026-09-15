import type { Question, Quiz, QuizRepository, Subject } from '../domain/types';

// This is deliberately content-only. Populate questions through the extraction/review pipeline; do not edit source wording in the UI.
export const subjects: Subject[] = [
  ['anat_histo', 'Anatomy & Histology'], ['biochem', 'Biochemistry'], ['leg_med', 'Legal Medicine'], ['medicine', 'Internal Medicine'], ['micropara', 'Microbiology & Parasitology'], ['ob', 'Obstetrics & Gynecology'], ['patho', 'Pathology'], ['pedia', 'Pediatrics'], ['pharm', 'Pharmacology'], ['physio', 'Physiology'], ['prev_med', 'Preventive Medicine'], ['surg', 'Surgery']
].map(([id, name], i) => ({ id, name, description: 'Practice tests from the source collection', accent: ['#b9511b','#c67428','#9b4a2d'][i % 3] }));

const testNames: Record<string, string[]> = {
  anat_histo: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  biochem: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  leg_med: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C', 'Supersamplex'],
  medicine: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  micropara: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  ob: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  patho: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  pedia: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  pharm: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C'],
  physio: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C', 'USMLE-style Practice Test'],
  prev_med: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C', 'Supersamplex'],
  surg: ['Practice Test 1', 'Practice Test 2', 'Practice Test 3', 'Practice Test 4', 'Practice Test 5', 'Practice Test A', 'Practice Test B', 'Practice Test C']
};
export const quizzes: Quiz[] = Object.entries(testNames).flatMap(([subjectId, names]) => names.map((name, index) => ({ id: `${subjectId}-${index + 1}`, subjectId, name, sourcePdf: `tn-pdfs/${subjectId}/tests/`, questionCount: 0, status: 'needs_review' as const })));
export const questions: Question[] = [];
export const questionBank: QuizRepository = { listSubjects: () => subjects, listQuizzes: id => quizzes.filter(q => q.subjectId === id), listQuestions: id => questions.filter(q => q.quizId === id) };
