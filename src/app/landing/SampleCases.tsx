import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { commitAnswer, blankResponse, isCorrect } from '../../domain/quizEngine';
import type { Attempt, Question } from '../../domain/types';
import { QuestionCard } from '../../features/quizzes/components/quiz/QuestionCard';
import { CelebrationOverlay } from '../../features/quizzes/components/celebration/CelebrationOverlay';
import { celebrationForStreak, type CelebrationEvent } from '../../features/quizzes/components/celebration/celebrationCatalog';
import { StudyNavigationFooter } from '../../shared/ui/study/StudyHeader';
import { StudyNavigatorTile } from '../../shared/ui/study/StudyNavigatorTile';
import { useStudyArrowNavigation } from '../../shared/ui/study/useStudyArrowNavigation';
import { SwapTransition } from '../../shared/ui/transitions/SwapTransition';
import { useReducedMotion } from '../../shared/ui/motion';
import { SampleHeader } from './SampleHeader';
import { type } from './typography';
import { useSampleActive } from './useSampleActive';
import samples from './samples.json';

const cases = samples.questions.map(({ subject, topic, ...question }) => ({ subject, topic, question: question as Question }));

const freshAttempt = (): Attempt => ({
  id: 'landing', quizId: 'landing', subjectId: 'landing', feedbackMode: 'immediate', startedAt: '', elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, responses: {},
});

/** Room kept for the feedback header plus the first lines of the rationale, and the mobile CTA bar. */
const feedbackReveal = 220;
const readDelay = 4000;

/** Reports how far the visitor has come through the hero steps: 1 answered, 2 read or moved on, 3 a streak. */
export function SampleCases({ onStart, onStep }: { onStart: () => void; onStep: (step: number) => void }) {
  const [attempt, setAttempt] = useState(freshAttempt);
  const [index, setIndex] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationEvent>();
  const region = useRef<HTMLElement>(null);
  const answered = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const active = useSampleActive(region);
  const { question, subject, topic } = cases[index]!;
  const response = attempt.responses[question.id] ?? blankResponse(question.id);
  const answers = cases.filter(item => attempt.responses[item.question.id]?.selectedChoiceId);
  const correct = cases.filter(item => isCorrect(item.question, attempt.responses[item.question.id]?.selectedChoiceId));

  const select = (choiceId: string) => {
    const result = commitAnswer(attempt, question, choiceId);
    answered.current = true;
    setAttempt(result.attempt);
    onStep(1);
    if (result.streakMilestone) {
      setCelebration(celebrationForStreak(result.streakMilestone));
      onStep(3);
    }
  };

  // On short screens the rationale lands below the fold; bring its header into view after an answer.
  useEffect(() => {
    if (!answered.current) return;
    answered.current = false;
    const panel = region.current?.querySelector<HTMLElement>('[aria-live="polite"]');
    if (!panel) return;
    const top = panel.getBoundingClientRect().top;
    const limit = window.innerHeight - feedbackReveal;
    if (top > limit) window.scrollBy({ top: top - limit, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [attempt, reducedMotion]);

  // Time with the rationale on screen counts as reading it.
  useEffect(() => {
    if (!response.locked) return;
    const timer = window.setTimeout(() => onStep(2), readDelay);
    return () => window.clearTimeout(timer);
  }, [response.locked, onStep]);

  const go = (target: number) => {
    if (target < 0 || target >= cases.length) return;
    if (response.locked && target !== index) onStep(2);
    setIndex(target);
  };
  const restart = () => { setAttempt(freshAttempt()); setIndex(0); };
  useStudyArrowNavigation({ index, total: cases.length, disabled: !active || Boolean(celebration), onPrevious: () => go(index - 1), onNext: () => go(index + 1), nextButtonRef: nextRef, finishButtonRef: finishRef });

  return <Box component="section" ref={region} aria-labelledby="sample-case-label">
    <SampleHeader id="sample-case-label" title={`Case ${index + 1} of ${cases.length}`} detail={`${subject} · ${topic}`} navLabel="Cases">
      {cases.map((item, position) => {
        const selected = attempt.responses[item.question.id]?.selectedChoiceId;
        const result = selected === undefined ? undefined : isCorrect(item.question, selected) ? 'correct' : 'incorrect';
        return <StudyNavigatorTile key={item.question.id} number={position + 1} label="Case" current={position === index} highlighted={false} flagged={false} status={result ?? 'unanswered'} result={result} onClick={() => go(position)} />;
      })}
    </SampleHeader>
    <Box sx={{ position: 'relative' }}>
      <SwapTransition swapKey={index}>
        <QuestionCard key={question.id} question={question} response={response} showFeedback={response.locked} onSelect={select} burstOnCorrect keyboardShortcuts shortcutsDisabled={!active || Boolean(celebration)} />
      </SwapTransition>
      {celebration && <CelebrationOverlay key={celebration.id} open contained title={celebration.title} message={celebration.message} variant={celebration.variant} level={celebration.level} onComplete={() => setCelebration(undefined)} />}
    </Box>
    <StudyNavigationFooter index={index} total={cases.length} onPrevious={() => go(index - 1)} onNext={() => go(index + 1)} onFinish={onStart} finishLabel="Start studying" nextLabel={response.locked ? 'Continue' : 'Next'} nextButtonRef={nextRef} finishButtonRef={finishRef} />
    {answers.length === cases.length && <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mt: 2, justifyContent: 'flex-end' }}>
      <Typography sx={type.caption}>You answered {correct.length} of {cases.length} correctly.</Typography>
      <Button size="small" onClick={restart} sx={{ p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent' } }}>Try again</Button>
    </Stack>}
  </Box>;
}
