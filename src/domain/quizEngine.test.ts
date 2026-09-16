import { describe, expect, it } from 'vitest'; import { blankResponse, elapsedTimeFor, normalizeResponseForFeedbackMode, pauseAttempt, questionIndexFor, resumeAttempt, scoreAttempt, selectChoice } from './quizEngine'; import type { Attempt, Question } from './types';
const question: Question={id:'q1',subjectId:'s',quizId:'z',stem:'Stem',choices:[{id:'A',text:'A'},{id:'B',text:'B'}],verifiedAnswer:'B',answerSource:'verified',metadata:{},source:{pdfFile:'source.pdf'}};
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
