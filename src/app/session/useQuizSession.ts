import { useEffect, useState } from 'react';
import {
  normalizeResponseForFeedbackMode,
  pauseAttempt,
  questionIndexFor,
  resumeAttempt,
  scoreAttempt,
  updateResponse,
} from '../../domain/quizEngine';
import type { Attempt, AttemptRepository, CompletedAttempt, FeedbackMode, Quiz, QuizRepository, Subject } from '../../domain/types';
import { subjectForQuiz, type View } from '../navigation';

interface QuizSession {
  view: View;
  completedAttempts: CompletedAttempt[];
  resumeQuiz: (quiz: Quiz) => void;
  startQuiz: (quiz: Quiz, mode: FeedbackMode) => void;
  browseQuiz: (quiz: Quiz) => void;
  navigateBrowse: (index: number) => void;
  leaveBrowse: () => void;
  checkpoint: (attempt: Attempt, index?: number) => void;
  finishQuiz: () => void;
  leaveQuiz: () => void;
  abortQuiz: () => void;
  showDashboard: () => void;
  showSubject: (subject: Subject) => void;
  showQuizSubject: (quiz: Quiz) => void;
}

export function useQuizSession(questionBank: QuizRepository, attempts: AttemptRepository): QuizSession {
  const [view, setView] = useState<View>({ page: 'dashboard' });
  const [completedAttempts, setCompletedAttempts] = useState(() => attempts.list());
  const subjects = questionBank.listSubjects();
  const refreshCompletedAttempts = () => setCompletedAttempts(attempts.list());
  const showQuizSubject = (quiz: Quiz) => setView({ page: 'subject', subject: subjectForQuiz(subjects, quiz) });

  const checkpoint = (next: Attempt, nextIndex?: number) => {
    if (view.page !== 'quiz') return;
    const bank = questionBank.listQuestions(view.quiz.id);
    const index = nextIndex ?? view.index;
    const checkpointed = { ...next, currentQuestionId: bank[index]?.id };
    attempts.saveActive(checkpointed);
    setView({ ...view, attempt: checkpointed, index });
  };

  const resumeQuiz = (quiz: Quiz) => {
    const existing = attempts.getActive(quiz.id);
    if (!existing) return;
    const resumed = resumeAttempt(existing);
    attempts.saveActive(resumed);
    setView({ page: 'quiz', quiz, attempt: resumed, index: questionIndexFor(questionBank.listQuestions(quiz.id), resumed.currentQuestionId) });
  };

  const startQuiz = (quiz: Quiz, mode: FeedbackMode) => {
    const now = new Date().toISOString();
    const attempt: Attempt = {
      id: crypto.randomUUID(), quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: mode,
      startedAt: now, elapsedMs: 0, timerStartedAt: now,
      currentQuestionId: questionBank.listQuestions(quiz.id)[0]?.id, celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, responses: {},
    };
    attempts.saveActive(attempt);
    setView({ page: 'quiz', quiz, attempt, index: 0 });
  };

  const browseQuiz = (quiz: Quiz) => setView({ page: 'quiz-browse', quiz, index: 0 });
  const navigateBrowse = (index: number) => {
    if (view.page !== 'quiz-browse') return;
    const lastIndex = questionBank.listQuestions(view.quiz.id).length - 1;
    setView({ ...view, index: Math.max(0, Math.min(index, lastIndex)) });
  };
  const leaveBrowse = () => {
    if (view.page === 'quiz-browse') showQuizSubject(view.quiz);
  };

  const finishQuiz = () => {
    if (view.page !== 'quiz') return;
    const paused = pauseAttempt(view.attempt);
    const complete: CompletedAttempt = {
      ...paused,
      completedAt: new Date().toISOString(),
      score: scoreAttempt(paused, questionBank.listQuestions(view.quiz.id)),
    };
    attempts.saveCompleted(complete);
    attempts.clearActive(view.quiz.id);
    refreshCompletedAttempts();
    setView({ page: 'results', quiz: view.quiz, attempt: complete });
  };

  const leaveQuiz = () => {
    if (view.page !== 'quiz') return;
    const question = questionBank.listQuestions(view.quiz.id)[view.index];
    attempts.saveActive(pauseAttempt({ ...view.attempt, currentQuestionId: question.id }));
    showQuizSubject(view.quiz);
  };

  const abortQuiz = () => {
    if (view.page !== 'quiz') return;
    attempts.clearActive(view.quiz.id);
    showQuizSubject(view.quiz);
  };

  useEffect(() => {
    if (view.page !== 'quiz') return;
    const pauseOnPageHide = () => attempts.saveActive(pauseAttempt(view.attempt));
    window.addEventListener('pagehide', pauseOnPageHide);
    return () => window.removeEventListener('pagehide', pauseOnPageHide);
  }, [attempts, view]);

  useEffect(() => {
    if (view.page !== 'quiz') return;
    const question = questionBank.listQuestions(view.quiz.id)[view.index];
    const response = view.attempt.responses[question.id];
    if (!response) return;
    const normalized = normalizeResponseForFeedbackMode(response, view.attempt.feedbackMode);
    if (normalized !== response) checkpoint(updateResponse(view.attempt, normalized));
  }, [questionBank, view]);

  return {
    view,
    completedAttempts,
    resumeQuiz,
    startQuiz,
    browseQuiz,
    navigateBrowse,
    leaveBrowse,
    checkpoint,
    finishQuiz,
    leaveQuiz,
    abortQuiz,
    showDashboard: () => setView({ page: 'dashboard' }),
    showSubject: subject => setView({ page: 'subject', subject }),
    showQuizSubject,
  };
}
