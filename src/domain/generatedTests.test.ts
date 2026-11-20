import { describe, expect, it } from 'vitest';
import { MIXED_TEST_SIZE, selectTestQuestions, type SubjectQuestions } from './generatedTests';

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const fromTopic = (picked: string[], prefix: string) => picked.filter((id) => id.startsWith(prefix));

describe('selectTestQuestions', () => {
  it('splits slots evenly across topics', () => {
    const subject: SubjectQuestions = [[ids('a', 20)], [ids('b', 20)], [ids('c', 20)]];
    const picked = selectTestQuestions([subject], 30, 1);
    expect(['a', 'b', 'c'].map((p) => fromTopic(picked, p).length)).toEqual([10, 10, 10]);
  });

  it('gives all of a short topic and frees its slots for the others', () => {
    const subject: SubjectQuestions = [[ids('a', 2)], [ids('b', 20)], [ids('c', 20)]];
    const picked = selectTestQuestions([subject], 30, 1);
    expect(fromTopic(picked, 'a')).toEqual(ids('a', 2));
    expect(fromTopic(picked, 'b').length + fromTopic(picked, 'c').length).toBe(28);
    expect(fromTopic(picked, 'b').length).toBe(14);
  });

  it('gives every extra slot to a different topic when slots do not divide evenly', () => {
    const subject: SubjectQuestions = [[ids('a', 20)], [ids('b', 20)], [ids('c', 20)]];
    const sizes = ['a', 'b', 'c'].map((p) => fromTopic(selectTestQuestions([subject], 10, 3), p).length);
    expect(sizes.sort()).toEqual([3, 3, 4]);
  });

  it('returns all questions when the subject has fewer than the size', () => {
    const subject: SubjectQuestions = [[ids('a', 3)], [ids('b', 4)]];
    expect(selectTestQuestions([subject], 100, 1).sort()).toEqual([...ids('a', 3), ...ids('b', 4)]);
  });

  it('ignores empty topics and quizzes', () => {
    const subject: SubjectQuestions = [[], [[], ids('a', 5)], [ids('b', 5)]];
    const picked = selectTestQuestions([subject], 4, 1);
    expect(fromTopic(picked, 'a').length).toBe(2);
    expect(fromTopic(picked, 'b').length).toBe(2);
  });

  it('takes from a topic quizzes in turn', () => {
    const subject: SubjectQuestions = [[ids('x', 10), ids('y', 10)]];
    const picked = selectTestQuestions([subject], 4, 1);
    expect(fromTopic(picked, 'x').length).toBe(2);
    expect(fromTopic(picked, 'y').length).toBe(2);
  });

  it('lists the selection in canonical order', () => {
    const picked = selectTestQuestions([[[ids('x', 10), ids('y', 10)]]], 8, 5);
    expect(picked).toEqual([...picked].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  });

  it('splits a Mixed Test across subjects first', () => {
    const big: SubjectQuestions = [[ids('a', 50)], [ids('b', 50)]];
    const small: SubjectQuestions = [[ids('c', 50)]];
    const picked = selectTestQuestions([big, small], 20, 1);
    expect(fromTopic(picked, 'c').length).toBe(10);
    expect(fromTopic(picked, 'a').length).toBe(5);
    expect(fromTopic(picked, 'b').length).toBe(5);
  });

  it('is deterministic for a seed, varies across seeds and never repeats a question', () => {
    const subject: SubjectQuestions = [[ids('a', 400)], [ids('b', 400)]];
    const first = selectTestQuestions([subject], MIXED_TEST_SIZE, 7);
    expect(selectTestQuestions([subject], MIXED_TEST_SIZE, 7)).toEqual(first);
    expect(selectTestQuestions([subject], MIXED_TEST_SIZE, 8)).not.toEqual(first);
    expect(new Set(first).size).toBe(MIXED_TEST_SIZE);
  });
});
