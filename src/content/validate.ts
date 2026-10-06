import type { Question, Quiz, Subject } from '../domain/types';
import type { StoredFlashcardBank, StoredQuestionBank } from './schema';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  questionId?: string;
}

const metadataKeys = new Set(['topic', 'subtopic', 'system', 'difficulty', 'questionType', 'tags']);
const rationaleMetaKeys = new Set(['sources', 'answerReviewNote', 'provenance', 'reviewedAt', 'reviewNote']);
const subjectKeys = new Set(['id', 'name', 'accent']);
const quizKeys = new Set(['id', 'subjectId', 'name']);
const questionKeys = new Set(['id', 'quizId', 'stem', 'choices', 'answer', 'verifiedAnswer', 'answerNote', 'rationale', 'rationaleMeta', 'choiceExplanations', 'pearls', 'metadata']);
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateQuestionBank(subjects: Subject[], quizzes: Quiz[], questions: Question[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subjectIds = new Set<string>();
  const quizById = new Map<string, Quiz>();
  const seenQuestionIds = new Set<string>();
  const closedQuizIds = new Set<string>();
  let currentQuizId: string | undefined;

  subjects.forEach(subject => {
    if (!subject.name.trim()) issues.push({ level: 'error', message: `Subject ${subject.id} has an empty name` });
    if (!subject.id) issues.push({ level: 'error', message: 'Missing subject ID' });
    else if (subjectIds.has(subject.id)) issues.push({ level: 'error', message: `Duplicate subject ID: ${subject.id}` });
    else subjectIds.add(subject.id);
  });

  quizzes.forEach(quiz => {
    if (!quiz.name.trim()) issues.push({ level: 'error', message: `Quiz ${quiz.id} has an empty name` });
    if (!quiz.id) issues.push({ level: 'error', message: 'Missing quiz ID' });
    else if (quizById.has(quiz.id)) issues.push({ level: 'error', message: `Duplicate quiz ID: ${quiz.id}` });
    else quizById.set(quiz.id, quiz);
    if (!subjectIds.has(quiz.subjectId)) issues.push({ level: 'error', message: `Quiz ${quiz.id} has an invalid subject reference` });
  });

  questions.forEach(question => {
    const error = (message: string) => issues.push({ level: 'error', message, questionId: question.id });
    if (!question.id) error('Missing question ID');
    else if (seenQuestionIds.has(question.id)) error('Duplicate question ID');
    else seenQuestionIds.add(question.id);

    if (!question.stem.trim()) error('Empty stem');
    if (!question.rationale?.trim()) error('Missing rationale Markdown');
    if (!question.quizId || !quizById.has(question.quizId)) error('Invalid quiz reference');
    if (currentQuizId && currentQuizId !== question.quizId) closedQuizIds.add(currentQuizId);
    if (closedQuizIds.has(question.quizId)) error('Questions for a quiz must be contiguous to preserve canonical order');
    currentQuizId = question.quizId;

    if (question.choices.length < 2 || question.choices.some(choice => !choice.id || !choice.text.trim())) error('Missing or empty choices');
    if (new Set(question.choices.map(choice => choice.id)).size !== question.choices.length) error('Duplicate choice IDs');
    if (question.choices.some(choice => !/^[A-Z]$/.test(choice.id))) error('Choice IDs must be A-Z labels');
    const answer = question.verifiedAnswer ?? question.answer;
    if (!answer || !question.choices.some(choice => choice.id === answer)) error('Correct answer does not reference a choice');
    if (question.answer !== undefined && !question.choices.some(choice => choice.id === question.answer)) error('Provided answer does not reference a choice');
    if (question.verifiedAnswer !== undefined && !question.choices.some(choice => choice.id === question.verifiedAnswer)) error('Verified answer does not reference a choice');
    if (question.metadata.difficulty && !['easy', 'medium', 'hard', 'unknown'].includes(question.metadata.difficulty)) error('Invalid difficulty');
    if (question.choiceExplanations && Object.keys(question.choiceExplanations).some(id => !question.choices.some(choice => choice.id === id))) error('Choice explanation references unknown choice');
    const meta = question.rationaleMeta;
    if (meta?.provenance === 'ai_draft_reviewed' && (!meta.reviewedAt?.trim() || !meta.reviewNote?.trim())) error('Reviewed draft requires review date and note');
  });

  quizzes.forEach(quiz => {
    if (!questions.some(question => question.quizId === quiz.id)) issues.push({ level: 'error', message: `Quiz ${quiz.id} has no questions` });
  });
  return issues;
}

export function validateStoredQuestionBank(bank: StoredQuestionBank): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (bank.schemaVersion !== 4) issues.push({ level: 'error', message: `Unsupported question bank schema version: ${bank.schemaVersion}` });
  if (Object.keys(bank).some(key => !['schemaVersion', 'subjects', 'quizzes', 'questions'].includes(key))) issues.push({ level: 'error', message: 'Bank stores an unknown field' });
  bank.subjects.forEach(subject => {
    if ('description' in subject) issues.push({ level: 'error', message: `Subject ${subject.id} stores a redundant description` });
    if (Object.keys(subject).some(key => !subjectKeys.has(key) && key !== 'description')) issues.push({ level: 'error', message: `Subject ${subject.id} stores an unknown field` });
  });
  bank.quizzes.forEach(quiz => {
    if ('questionCount' in quiz) issues.push({ level: 'error', message: `Quiz ${quiz.id} stores a derived question count` });
    if (Object.keys(quiz).some(key => !quizKeys.has(key) && key !== 'questionCount')) issues.push({ level: 'error', message: `Quiz ${quiz.id} stores an unknown field` });
  });
  bank.subjects.forEach(subject => {
    if (!/^s[1-9]\d*$/.test(subject.id)) issues.push({ level: 'error', message: `Subject ${subject.id} does not use a compact ID` });
  });
  bank.quizzes.forEach(quiz => {
    if (!/^q[1-9]\d*$/.test(quiz.id)) issues.push({ level: 'error', message: `Quiz ${quiz.id} does not use a compact ID` });
  });
  bank.questions.forEach(question => {
    const error = (message: string) => issues.push({ level: 'error', message, questionId: question.id });
    if (!/^i[1-9]\d*$/.test(question.id)) error('Question does not use a compact ID');
    if ('subjectId' in question) error('Question stores a redundant subject reference');
    if ('questionNumber' in question) error('Question stores a derived array position');
    if ('answerSource' in question) error('Question stores a derived answer source');
    if ('sourceAnswer' in question) error('Question uses the legacy sourceAnswer field');
    if (Object.keys(question).some(key => !questionKeys.has(key))) error('Question stores an unknown field');
    if (question.answerNote !== undefined && typeof question.answerNote !== 'string') error('Invalid answer note');
    const explanations: unknown = question.choiceExplanations;
    if (explanations !== undefined && (!object(explanations) || Object.values(explanations).some(value => typeof value !== 'string'))) error('Invalid choice explanations');
    const pearls: unknown = question.pearls;
    if (pearls !== undefined && (!Array.isArray(pearls) || pearls.some(value => typeof value !== 'string'))) error('Invalid pearls');
    const rationaleMeta: unknown = question.rationaleMeta;
    if (rationaleMeta !== undefined) {
      if (!object(rationaleMeta) || Object.keys(rationaleMeta).some(key => !rationaleMetaKeys.has(key))
        || ['sources', 'answerReviewNote', 'reviewedAt', 'reviewNote'].some(key => rationaleMeta[key] !== undefined && typeof rationaleMeta[key] !== 'string')
        || (rationaleMeta.provenance !== undefined && !['source_migrated', 'ai_draft_reviewed'].includes(rationaleMeta.provenance as string))) {
        error('Invalid rationale metadata');
      }
    }
    const metadata: unknown = question.metadata;
    if (metadata === undefined) return;
    if (!object(metadata) || Object.keys(metadata).some(key => !metadataKeys.has(key))
      || ['topic', 'subtopic', 'system', 'questionType'].some(key => metadata[key] !== undefined && typeof metadata[key] !== 'string')
      || (metadata.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(metadata.difficulty as string))
      || (metadata.tags !== undefined && (!Array.isArray(metadata.tags) || !metadata.tags.every(tag => typeof tag === 'string')))) {
      error('Invalid question metadata');
      return;
    }
    if (!Object.values(metadata).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))) error('Question stores an empty metadata object');
  });
  return issues;
}

export function validateStoredFlashcardBank(bank: StoredFlashcardBank, subjects: Subject[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (message: string, id?: string) => issues.push({ level: 'error', message, ...(id ? { questionId: id } : {}) });
  const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!object(bank)) return [{ level: 'error', message: 'Flashcard bank must be an object' }];
  if (bank.schemaVersion !== 1) issue(`Unsupported flashcard bank schema version: ${bank.schemaVersion}`);
  if (Object.keys(bank).some(key => !['schemaVersion', 'topics', 'decks', 'cards'].includes(key))) issue('Flashcard bank stores an unknown field');
  if (!Array.isArray(bank.topics) || !Array.isArray(bank.decks) || !Array.isArray(bank.cards)) {
    issue('Flashcard bank must contain topic, deck, and card arrays');
    return issues;
  }

  const subjectIds = new Set(subjects.map(subject => subject.id));
  const topicIds = new Set<string>();
  const deckIds = new Set<string>();
  const cardIds = new Set<string>();
  const topicKeys = new Set(['id', 'subjectId', 'name']);
  const deckKeys = new Set(['id', 'topicId', 'name', 'description']);
  const cardKeys = new Set(['id', 'deckId', 'front', 'back', 'sources', 'reviewNote']);
  const topicsById = new Map<string, StoredFlashcardBank['topics'][number]>();
  const decksById = new Map<string, StoredFlashcardBank['decks'][number]>();

  bank.topics.forEach(topic => {
    if (!object(topic)) { issue('Topic record must be an object'); return; }
    if (Object.keys(topic).some(key => !topicKeys.has(key))) issue('Topic stores an unknown field', topic.id);
    if (typeof topic.id !== 'string' || !/^t[a-zA-Z0-9-]+$/.test(topic.id)) issue('Topic ID must use the t prefix', topic.id);
    if (typeof topic.id !== 'string' || !topic.id || topicIds.has(topic.id)) { issue('Missing or duplicate topic ID', topic.id); return; }
    topicIds.add(topic.id);
    topicsById.set(topic.id, topic);
    if (typeof topic.subjectId !== 'string' || !subjectIds.has(topic.subjectId)) issue('Topic references an unknown subject', topic.id);
    if (typeof topic.name !== 'string' || !topic.name.trim()) issue('Topic name must not be empty', topic.id);
  });

  bank.decks.forEach(deck => {
    if (!object(deck)) { issue('Deck record must be an object'); return; }
    if (Object.keys(deck).some(key => !deckKeys.has(key))) issue('Deck stores an unknown field', deck.id);
    if (typeof deck.id !== 'string' || !/^d[a-zA-Z0-9-]+$/.test(deck.id)) issue('Deck ID must use the d prefix', deck.id);
    if (typeof deck.id !== 'string' || !deck.id || deckIds.has(deck.id)) { issue('Missing or duplicate deck ID', deck.id); return; }
    deckIds.add(deck.id);
    decksById.set(deck.id, deck);
    if (typeof deck.topicId !== 'string' || !topicsById.has(deck.topicId)) issue('Deck references an unknown topic', deck.id);
    if (typeof deck.name !== 'string' || !deck.name.trim()) issue('Deck name must not be empty', deck.id);
    if (deck.description !== undefined && typeof deck.description !== 'string') issue('Invalid deck description', deck.id);
  });

  bank.cards.forEach(card => {
    if (!object(card)) { issue('Card record must be an object'); return; }
    if (Object.keys(card).some(key => !cardKeys.has(key))) issue('Card stores an unknown field', card.id);
    if (typeof card.id !== 'string' || !/^f[a-zA-Z0-9-]+$/.test(card.id)) issue('Card ID must use the f prefix', card.id);
    if (typeof card.id !== 'string' || !card.id || cardIds.has(card.id)) { issue('Missing or duplicate card ID', card.id); return; }
    cardIds.add(card.id);
    if (typeof card.deckId !== 'string' || !decksById.has(card.deckId)) issue('Card references an unknown deck', card.id);
    if (typeof card.front !== 'string' || !card.front.trim()) issue('Card front must not be empty', card.id);
    if (typeof card.back !== 'string' || !card.back.trim()) issue('Card back must not be empty', card.id);
    if (card.sources !== undefined && typeof card.sources !== 'string') issue('Invalid card sources', card.id);
    if (card.reviewNote !== undefined && typeof card.reviewNote !== 'string') issue('Invalid card review note', card.id);
  });
  return issues;
}

export function validateFlashcardSubjectReferences(bank: StoredFlashcardBank, subjects: Subject[]): ValidationIssue[] {
  const subjectIds = new Set(subjects.map(subject => subject.id));
  return bank.topics
    .filter(topic => !subjectIds.has(topic.subjectId))
    .map(topic => ({ level: 'error' as const, message: `Topic ${topic.id} references an unknown subject ${topic.subjectId}.` }));
}
