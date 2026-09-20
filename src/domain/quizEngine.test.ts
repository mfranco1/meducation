import { describe, expect, it } from 'vitest'; import { blankResponse, commitAnswer, elapsedTimeFor, isPerfectScore, normalizeResponseForFeedbackMode, pauseAttempt, questionIndexFor, resumeAttempt, scoreAttempt, selectChoice } from './quizEngine'; import type { Attempt, Question } from './types';
const question: Question={id:'q1',subjectId:'s',quizId:'z',stem:'Stem',choices:[{id:'A',text:'A'},{id:'B',text:'B'}],verifiedAnswer:'B',answerSource:'verified',metadata:{}};
const attempt=(selectedChoiceId?:string):Attempt=>({id:'a',quizId:'z',subjectId:'s',feedbackMode:'exam',startedAt:new Date(1000).toISOString(),responses:selectedChoiceId?{q1:{questionId:'q1',selectedChoiceId,flagged:true,locked:false,timeMs:0}}:{}});
describe('quiz engine',()=>{it('scores correct, incorrect, and unanswered responses',()=>{expect(scoreAttempt(attempt('B'),[question],3000)).toMatchObject({correct:1,incorrect:0,unanswered:0,percentage:100,elapsedMs:2000});expect(scoreAttempt(attempt('A'),[question],3000).incorrect).toBe(1);expect(scoreAttempt(attempt(),[question],3000).unanswered).toBe(1)});it('finds a saved question checkpoint and falls back to the first question',()=>{const second={...question,id:'q2'};expect(questionIndexFor([question,second],'q2')).toBe(1);expect(questionIndexFor([question,second],'missing')).toBe(0);expect(questionIndexFor([question,second])).toBe(0)});});
describe('attempt timing',()=>{
  it('accumulates only active quiz sessions',()=>{
    const running: Attempt={...attempt(),elapsedMs:500,timerStartedAt:new Date(1000).toISOString()};
    expect(elapsedTimeFor(running,3000)).toBe(2500);
    const paused=pauseAttempt(running,3000);
    expect(paused).toMatchObject({elapsedMs:2500});
    expect(paused.timerStartedAt).toBeUndefined();
    expect(elapsedTimeFor(paused,9000)).toBe(2500);
    const resumed=resumeAttempt(paused,9000);
    expect(elapsedTimeFor(resumed,12000)).toBe(5500);
    expect(scoreAttempt(resumed,[question],12000).elapsedMs).toBe(5500);
  });
  it('migrates a legacy saved attempt without resetting its elapsed time',()=>{
    const legacy=attempt();
    const resumed=resumeAttempt(legacy,5000);
    expect(resumed.elapsedMs).toBe(4000);
    expect(elapsedTimeFor(resumed,7000)).toBe(6000);
  });
});
describe('answer selection',()=>{
  it('locks an immediate-mode response as part of selection',()=>{expect(selectChoice(blankResponse('q1'),'B','immediate')).toMatchObject({selectedChoiceId:'B',locked:true});});
  it('keeps an exam-mode response editable',()=>{const selected=selectChoice(blankResponse('q1'),'A','exam');expect(selected).toMatchObject({selectedChoiceId:'A',locked:false});expect(selectChoice(selected,'B','exam').selectedChoiceId).toBe('B');});
  it('does not change a locked response',()=>{const locked={...blankResponse('q1'),selectedChoiceId:'A',locked:true};expect(selectChoice(locked,'B','immediate')).toBe(locked);});
  it('locks a selected legacy immediate-mode response',()=>{const legacy={...blankResponse('q1'),selectedChoiceId:'B'};expect(normalizeResponseForFeedbackMode(legacy,'immediate')).toMatchObject({selectedChoiceId:'B',locked:true});expect(normalizeResponseForFeedbackMode(legacy,'exam')).toBe(legacy);});
});
describe('celebration streaks',()=>{
  const immediateAttempt = (): Attempt => ({ ...attempt(), feedbackMode: 'immediate' });
  const correctQuestion = (id: string): Question => ({ ...question, id, verifiedAnswer: 'B' });
  it('increments correct commits, resets on an incorrect commit, and fires exact milestones',()=>{
    let current = immediateAttempt();
    for (let index = 1; index <= 3; index++) {
      const result = commitAnswer(current, correctQuestion(`q${index}`), 'B');
      current = result.attempt;
      expect(result.streakMilestone).toBe(index === 3 ? 3 : undefined);
    }
    const wrong = commitAnswer(current, correctQuestion('wrong'), 'A');
    expect(wrong.attempt.celebrationProgress?.correctStreak).toBe(0);
    expect(wrong.streakMilestone).toBeUndefined();
  });
  it('allows a milestone to be earned again after an incorrect answer resets the streak',()=>{
    let current = immediateAttempt();
    const milestones: number[] = [];
    for (let index = 1; index <= 50; index++) {
      const result = commitAnswer(current, correctQuestion(`q${index}`), 'B');
      current = result.attempt;
      if (result.streakMilestone) milestones.push(result.streakMilestone);
    }
    expect(milestones).toEqual([3, 5, 10, 25, 50]);
    current = commitAnswer(current, correctQuestion('wrong'), 'A').attempt;
    expect(current.celebrationProgress).toEqual({ correctStreak: 0, awardedStreakMilestones: [] });
    let rebuiltMilestone: number | undefined;
    for (let index = 1; index <= 3; index++) {
      const result = commitAnswer(current, correctQuestion(`again${index}`), 'B');
      current = result.attempt;
      rebuiltMilestone = result.streakMilestone;
    }
    expect(rebuiltMilestone).toBe(3);
  });
  it('counts answer commit order, not question order, and never double-counts a locked response',()=>{
    let current = immediateAttempt();
    current = commitAnswer(current, correctQuestion('q30'), 'B').attempt;
    current = commitAnswer(current, correctQuestion('q2'), 'B').attempt;
    const third = commitAnswer(current, correctQuestion('q1'), 'B');
    expect(third.streakMilestone).toBe(3);
    const repeat = commitAnswer(third.attempt, correctQuestion('q1'), 'B');
    expect(repeat.streakMilestone).toBeUndefined();
    expect(repeat.attempt.celebrationProgress?.correctStreak).toBe(3);
  });
  it('does not create a live streak in exam mode and safely defaults legacy progress',()=>{
    const exam = commitAnswer(attempt(), question, 'B');
    expect(exam.streakMilestone).toBeUndefined();
    expect(exam.attempt.celebrationProgress).toBeUndefined();
    const legacy = commitAnswer({ ...immediateAttempt(), celebrationProgress: undefined }, question, 'B');
    expect(legacy.attempt.celebrationProgress).toMatchObject({ correctStreak: 1, awardedStreakMilestones: [] });
  });
});
describe('perfect scores',()=>{
  it('uses exact counts and requires at least one question',()=>{
    expect(isPerfectScore({ correct: 3, incorrect: 0, unanswered: 0, total: 3, percentage: 100, elapsedMs: 0 })).toBe(true);
    expect(isPerfectScore({ correct: 99, incorrect: 1, unanswered: 0, total: 100, percentage: 100, elapsedMs: 0 })).toBe(false);
    expect(isPerfectScore({ correct: 0, incorrect: 0, unanswered: 0, total: 0, percentage: 100, elapsedMs: 0 })).toBe(false);
  });
});
