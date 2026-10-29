import { useRef, useState } from 'react';
import { Container } from '@mui/material';
import { blankResponse, commitAnswer, isFullyAnsweredFastFeedback, isPerfectScore, scoreAttempt, updateResponse } from '../../../domain/quizEngine';
import type { Attempt, Question, Quiz } from '../../../domain/types';
import { CelebrationOverlay } from '../components/celebration/CelebrationOverlay';
import { celebrationForStreak, perfectTestCelebration, type CelebrationEvent } from '../components/celebration/celebrationCatalog';
import { QuestionCard } from '../components/quiz/QuestionCard';
import { QuestionNavigator, type QuestionNavigatorFilter } from '../components/quiz/QuestionNavigator';
import { QuestionNavigationLayout } from '../../../shared/ui/study/QuestionNavigationLayout';
import { SwapTransition } from '../../../shared/ui/transitions/SwapTransition';
import { Stopwatch } from '../components/quiz/Stopwatch';
import { SubmitQuizDialog } from '../components/quiz/SubmitQuizDialog';
import { StudyHeader, StudyNavigationFooter } from '../../../shared/ui/study/StudyHeader';
import { useStudyArrowNavigation } from '../../../shared/ui/study/useStudyArrowNavigation';

interface QuizScreenProps {
  quiz: Quiz;
  attempt: Attempt;
  index: number;
  questions: Question[];
  onCheckpoint: (attempt: Attempt, index?: number) => void;
  onFinish: () => void;
  onRequestExit: () => void;
}

export function QuizScreen({ attempt, index, questions, onCheckpoint, onFinish, onRequestExit }: QuizScreenProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEvent[]>([]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const submissionRequested = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const question = questions[index];
  useStudyArrowNavigation({ index, total: questions.length, disabled: navigatorOpen || submitOpen, onPrevious: () => navigateToQuestion(index - 1), onNext: () => navigateToQuestion(index + 1), nextButtonRef: nextRef, finishButtonRef: finishRef });
  const savedResponse = attempt.responses[question.id];
  const response = savedResponse ?? blankResponse(question.id);
  const feedback = response.locked && attempt.feedbackMode === 'immediate';
  const select = (choice: string) => {
    const result = commitAnswer(attempt, question, choice);
    onCheckpoint(result.attempt);
    const perfect = isFullyAnsweredFastFeedback(result.attempt, questions) && isPerfectScore(scoreAttempt(result.attempt, questions));
    const celebration = perfect ? perfectTestCelebration() : result.streakMilestone && celebrationForStreak(result.streakMilestone);
    if (celebration) setCelebrationQueue(queue => [...queue, celebration]);
  };
  const toggleFlag = () => onCheckpoint(updateResponse(attempt, { ...response, flagged: !response.flagged }));
  const navigateToQuestion = (targetIndex: number) => {
    onCheckpoint(attempt, targetIndex);
    setNavigatorOpen(false);
  };
  const requestSubmit = () => {
    submissionRequested.current = false;
    setSubmitOpen(true);
  };
  const confirmSubmit = () => {
    if (submissionRequested.current) return;
    submissionRequested.current = true;
    setSubmitOpen(false);
    onFinish();
  };

  const navigator = <QuestionNavigator
    questions={questions}
    attempt={attempt}
    currentIndex={index}
    filter={navigatorFilter}
    onFilterChange={setNavigatorFilter}
    onNavigate={navigateToQuestion}
  />;

  const celebration = celebrationQueue[0];
  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    {celebration && <CelebrationOverlay key={celebration.id} open title={celebration.title} message={celebration.message} variant={celebration.variant} level={celebration.level} onComplete={() => setCelebrationQueue(queue => queue.slice(1))} />}
    <StudyHeader itemLabel="Question" index={index} total={questions.length} exitLabel="Leave test" onExit={onRequestExit} completed={questions.filter(item => attempt.responses[item.id]?.selectedChoiceId).length} trailing={<Stopwatch attempt={attempt} />} />
    <QuestionNavigationLayout navigator={navigator} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)}>
        <SwapTransition swapKey={index}><QuestionCard key={question.id} question={question} response={response} showFeedback={feedback} burstOnCorrect={attempt.feedbackMode === 'immediate'} keyboardShortcuts shortcutsDisabled={navigatorOpen || submitOpen} onSelect={select} onToggleFlag={toggleFlag} /></SwapTransition>
        <StudyNavigationFooter index={index} total={questions.length} onPrevious={() => navigateToQuestion(index - 1)} onNext={() => navigateToQuestion(index + 1)} onFinish={requestSubmit} finishLabel={attempt.feedbackMode === 'exam' ? 'Submit' : 'Finish'} nextLabel={feedback ? 'Continue' : 'Next'} nextButtonRef={nextRef} finishButtonRef={finishRef} />
    </QuestionNavigationLayout>
    <SubmitQuizDialog open={submitOpen} onClose={() => setSubmitOpen(false)} onConfirm={confirmSubmit} />
  </Container>;
}
