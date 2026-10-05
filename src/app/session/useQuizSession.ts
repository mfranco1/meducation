import { useCallback, useEffect, useState } from 'react';
import {
  isFullyAnsweredFastFeedback,
  normalizeResponseForFeedbackMode,
  pauseAttempt,
  questionIndexFor,
  resumeAttempt,
  scoreAttempt,
  updateResponse,
} from '../../domain/quizEngine';
import { contentSignature } from '../../domain/contentSignature';
import type { Attempt, AttemptRepository, CompletedAttempt, FeedbackMode, Quiz, QuizRepository, Subject } from '../../domain/types';
import { PersistenceError } from '../../persistence/localRepository';
import { subjectForQuiz, type View } from '../navigation';

export type QuizExitDestination = 'subject' | 'dashboard';

interface QuizSession {
  view: View;
  persistenceError?: string;
  pendingResume?: { quiz: Quiz; reason: 'legacy' | 'changed' };
  clearPersistenceError: () => void;
  cancelPendingResume: () => void;
  restartPendingResume: () => void;
  resumeQuiz: (quiz: Quiz) => void;
  startQuiz: (quiz: Quiz, mode: FeedbackMode) => void;
  browseQuiz: (quiz: Quiz) => void;
  navigateBrowse: (index: number) => void;
  leaveBrowse: () => void;
  reviewResults: () => void;
  navigateReview: (index: number) => void;
  leaveReview: (destination?: QuizExitDestination) => void;
  checkpoint: (attempt: Attempt, index?: number) => void;
  finishQuiz: () => void;
  leaveQuiz: (destination?: QuizExitDestination) => void;
  abortQuiz: (destination?: QuizExitDestination) => void;
  showDashboard: () => void;
  showSubject: (subject: Subject) => void;
  showQuizSubject: (quiz: Quiz) => void;
}

export function useQuizSession(questionBank: QuizRepository, attempts: AttemptRepository): QuizSession {
  const [view, setView] = useState<View>({ page: 'dashboard' });
  const [persistenceError, setPersistenceError] = useState<string | undefined>(() => attempts.getStorageError?.());
  const [pendingResume, setPendingResume] = useState<{ quiz: Quiz; reason: 'legacy' | 'changed' }>();
  const persist = useCallback((write: () => void): boolean => {
    try { write(); setPersistenceError(undefined); return true; }
    catch (error) {
      setPersistenceError(error instanceof PersistenceError ? error.message : 'Progress could not be saved. Try again.');
      return false;
    }
  }, []);
  const subjects = questionBank.listSubjects();
  const showQuizSubject = (quiz: Quiz) => setView({ page: 'subject', subject: subjectForQuiz(subjects, quiz) });

  const checkpoint = useCallback((next: Attempt, nextIndex?: number) => {
    if (view.page !== 'quiz') return;
    const bank = questionBank.listQuestions(view.quiz.id);
    const index = nextIndex ?? view.index;
    const withCheckpoint = { ...next, currentQuestionId: bank[index]?.id };
    const checkpointed = isFullyAnsweredFastFeedback(withCheckpoint, bank)
      ? pauseAttempt(withCheckpoint)
      : withCheckpoint;
    if (!persist(() => attempts.saveActive(checkpointed))) return;
    setView({ ...view, attempt: checkpointed, index });
  }, [view, questionBank, attempts, persist]);

  const resumeQuiz = (quiz: Quiz) => {
    const existing = attempts.getActive(quiz.id);
    if (!existing) return;
    const questions = questionBank.listQuestions(quiz.id);
    const signature = contentSignature(questions);
    if (!existing.contentSignature || existing.contentSignature !== signature) {
      setPendingResume({ quiz, reason: existing.contentSignature ? 'changed' : 'legacy' });
      return;
    }
    const resumed = isFullyAnsweredFastFeedback(existing, questions)
      ? pauseAttempt(existing)
      : resumeAttempt(existing);
    if (!persist(() => attempts.saveActive(resumed))) return;
    setView({ page: 'quiz', quiz, attempt: resumed, index: questionIndexFor(questions, resumed.currentQuestionId) });
  };

  const beginQuiz = (quiz: Quiz, mode: FeedbackMode): boolean => {
    const now = new Date().toISOString();
    const questions = questionBank.listQuestions(quiz.id);
    const attempt: Attempt = {
      id: crypto.randomUUID(), quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: mode,
      startedAt: now, elapsedMs: 0, timerStartedAt: now,
      currentQuestionId: questions[0]?.id, contentSignature: contentSignature(questions), contentRevision: questionBank.contentRevision?.(),
      celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, responses: {},
    };
    if (!persist(() => attempts.saveActive(attempt))) return false;
    setView({ page: 'quiz', quiz, attempt, index: 0 });
    return true;
  };
  const startQuiz = (quiz: Quiz, mode: FeedbackMode) => { void beginQuiz(quiz, mode); };
  const restartPendingResume = () => {
    if (!pendingResume) return;
    const existing = attempts.getActive(pendingResume.quiz.id);
    if (!existing) { setPendingResume(undefined); return; }
    if (beginQuiz(pendingResume.quiz, existing.feedbackMode)) setPendingResume(undefined);
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

  const reviewResults = () => {
    if (view.page !== 'results' || view.attempt.feedbackMode !== 'exam') return;
    setView({ page: 'quiz-review', quiz: view.quiz, attempt: view.attempt, index: 0 });
  };
  const navigateReview = (index: number) => {
    if (view.page !== 'quiz-review') return;
    const lastIndex = questionBank.listQuestions(view.quiz.id).length - 1;
    setView({ ...view, index: Math.max(0, Math.min(index, lastIndex)) });
  };
  const leaveReview = (destination: QuizExitDestination = 'subject') => {
    if (view.page !== 'quiz-review') return;
    if (destination === 'dashboard') setView({ page: 'dashboard' });
    else showQuizSubject(view.quiz);
  };

  const finishQuiz = () => {
    if (view.page !== 'quiz') return;
    const paused = pauseAttempt(view.attempt);
    const complete: CompletedAttempt = {
      ...paused,
      completedAt: new Date().toISOString(),
      score: scoreAttempt(paused, questionBank.listQuestions(view.quiz.id)),
    };
    if (!persist(() => attempts.saveCompleted(complete))) return;
    setView({ page: 'results', quiz: view.quiz, attempt: complete });
  };

  const leaveQuiz = (destination: QuizExitDestination = 'subject') => {
    if (view.page !== 'quiz') return;
    const question = questionBank.listQuestions(view.quiz.id)[view.index];
    if (!persist(() => attempts.saveActive(pauseAttempt({ ...view.attempt, currentQuestionId: question.id })))) return;
    if (destination === 'dashboard') setView({ page: 'dashboard' });
    else showQuizSubject(view.quiz);
  };

  const abortQuiz = (destination: QuizExitDestination = 'subject') => {
    if (view.page !== 'quiz') return;
    if (!persist(() => attempts.clearActive(view.quiz.id))) return;
    if (destination === 'dashboard') setView({ page: 'dashboard' });
    else showQuizSubject(view.quiz);
  };

  useEffect(() => {
    if (view.page !== 'quiz') return;
    const pauseOnPageHide = () => {
      try { attempts.saveActive(pauseAttempt(view.attempt)); }
      catch { console.error('Progress could not be saved while leaving the page.'); }
    };
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
  }, [questionBank, view, checkpoint]);

  return {
    view,
    persistenceError,
    pendingResume,
    clearPersistenceError: () => setPersistenceError(undefined),
    cancelPendingResume: () => setPendingResume(undefined),
    restartPendingResume,
    resumeQuiz,
    startQuiz,
    browseQuiz,
    navigateBrowse,
    leaveBrowse,
    reviewResults,
    navigateReview,
    leaveReview,
    checkpoint,
    finishQuiz,
    leaveQuiz,
    abortQuiz,
    showDashboard: () => setView({ page: 'dashboard' }),
    showSubject: subject => setView({ page: 'subject', subject }),
    showQuizSubject,
  };
}
