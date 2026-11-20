import type { Quiz, Subject } from './types';
import { mulberry32, shuffled } from './quizEngine';

export const SUBJECT_TEST_SIZE = 100;
export const MIXED_TEST_SIZE = 300;
export const MIXED_TEST_ID = 'mixed-test';
export const subjectTestId = (subjectId: string) => `subject-test:${subjectId}`;
export const isGeneratedQuizId = (quizId: string) => quizId === MIXED_TEST_ID || quizId.startsWith('subject-test:');

/** Question IDs of each quiz in a topic, in canonical order. */
export type TopicQuestions = readonly (readonly string[])[];
/** A subject's topics, in canonical order. */
export type SubjectQuestions = readonly TopicQuestions[];

/** Splits `size` slots evenly across groups. A group never gets more than its capacity; its unused slots go to the others. */
function allocate(size: number, capacities: readonly number[], random: () => number): number[] {
  const shares = capacities.map(() => 0);
  let open = capacities.flatMap((capacity, index) => (capacity > 0 ? [index] : []));
  let remaining = Math.min(
    size,
    capacities.reduce((sum, capacity) => sum + capacity, 0),
  );
  while (remaining > 0) {
    const each = Math.floor(remaining / open.length);
    if (each === 0) {
      for (const index of shuffled(open, random).slice(0, remaining)) shares[index]!++;
      break;
    }
    for (const index of open) {
      const give = Math.min(each, capacities[index]! - shares[index]!);
      shares[index]! += give;
      remaining -= give;
    }
    open = open.filter((index) => shares[index]! < capacities[index]!);
  }
  return shares;
}

/** Takes `count` IDs from a topic's quizzes in turn, so they do not cluster in one quiz. Returns them in canonical order. */
function takeFromTopic(topic: TopicQuestions, count: number, random: () => number): string[] {
  const quizzes = shuffled(
    topic.filter((ids) => ids.length > 0),
    random,
  ).map((ids) => ({ ids, order: new Map(ids.map((id, index) => [id, index])), queue: shuffled(ids, random) }));
  const taken = new Map<readonly string[], Set<string>>(quizzes.map((quiz) => [quiz.ids, new Set()]));
  for (let round = 0, total = 0; total < count; round++)
    for (const quiz of quizzes) {
      const id = quiz.queue[round];
      if (id !== undefined && total < count) {
        taken.get(quiz.ids)!.add(id);
        total++;
      }
    }
  return topic.flatMap((ids) => ids.filter((id) => taken.get(ids)?.has(id)));
}

/**
 * Picks `size` question IDs for a generated test: evenly across subjects, then evenly across topics, then in turn
 * across quizzes. A Subject Test passes one subject, a Mixed Test all of them. Deterministic for a given seed.
 */
export function selectTestQuestions(subjects: readonly SubjectQuestions[], size: number, seed: number): string[] {
  const random = mulberry32(seed);
  const count = (topic: TopicQuestions) => topic.reduce((sum, ids) => sum + ids.length, 0);
  const subjectShares = allocate(
    size,
    subjects.map((topics) => topics.reduce((sum, topic) => sum + count(topic), 0)),
    random,
  );
  return subjects.flatMap((topics, subjectIndex) => {
    const topicShares = allocate(subjectShares[subjectIndex]!, topics.map(count), random);
    return topics.flatMap((topic, topicIndex) => takeFromTopic(topic, topicShares[topicIndex]!, random));
  });
}

export const subjectTestQuiz = (subject: Subject, questionCount: number): Quiz => ({
  id: subjectTestId(subject.id),
  subjectId: subject.id,
  topicId: '',
  name: `${subject.name} Subject Test`,
  questionCount: Math.min(SUBJECT_TEST_SIZE, questionCount),
});

export const mixedTestQuiz = (questionCount: number): Quiz => ({
  id: MIXED_TEST_ID,
  subjectId: MIXED_TEST_ID,
  topicId: '',
  name: 'Mixed Test',
  questionCount: Math.min(MIXED_TEST_SIZE, questionCount),
});
