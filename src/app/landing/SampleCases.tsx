import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { commitAnswer, blankResponse, isCorrect } from '../../domain/quizEngine';
import type { Attempt, Question } from '../../domain/types';
import { QuestionCard } from '../../features/quizzes/components/quiz/QuestionCard';
import { CelebrationOverlay } from '../../features/quizzes/components/celebration/CelebrationOverlay';
import { celebrationForStreak, type CelebrationEvent } from '../../features/quizzes/components/celebration/celebrationCatalog';
import { StudyNavigationFooter } from '../../shared/ui/study/StudyHeader';
import { StudyNavigatorTile } from '../../shared/ui/study/StudyNavigatorTile';
import { canHandleStudyShortcut } from '../../shared/ui/study/studyKeyboard';
import { SwapTransition } from '../../shared/ui/transitions/SwapTransition';
import { useReducedMotion } from '../../shared/ui/motion';
import { type } from './typography';
import samples from './samples.json';

const cases = samples.questions.map(({ subject, topic, ...question }) => ({ subject, topic, question: question as Question }));

const freshAttempt = (): Attempt => ({
  id: 'landing', quizId: 'landing', subjectId: 'landing', feedbackMode: 'immediate', startedAt: '', elapsedMs: 0,
  celebrationProgress: { correctStreak: 0, awardedStreakMilestones: [] }, responses: {},
});

/** Room kept for the feedback header plus the first lines of the rationale, and the mobile CTA bar. */
const feedbackReveal = 220;

export function SampleCases({ onStart }: { onStart: () => void }) {
  const [attempt, setAttempt] = useState(freshAttempt);
  const [index, setIndex] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationEvent>();
  const region = useRef<HTMLElement>(null);
  const answered = useRef(false);
  const reducedMotion = useReducedMotion();
  const { question, subject, topic } = cases[index]!;
  const response = attempt.responses[question.id] ?? blankResponse(question.id);
  const answers = cases.filter(item => attempt.responses[item.question.id]?.selectedChoiceId);
  const correct = cases.filter(item => isCorrect(item.question, attempt.responses[item.question.id]?.selectedChoiceId));

  const select = (choiceId: string) => {
    const result = commitAnswer(attempt, question, choiceId);
    answered.current = true;
    setAttempt(result.attempt);
    if (result.streakMilestone) setCelebration(celebrationForStreak(result.streakMilestone));
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

  const go = (target: number) => { if (target >= 0 && target < cases.length) setIndex(target); };
  const restart = () => { setAttempt(freshAttempt()); setIndex(0); };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.repeat || !canHandleStudyShortcut(event.nativeEvent, 'arrow')) return;
    event.preventDefault();
    go(index + (event.key === 'ArrowLeft' ? -1 : 1));
  };

  return <>
    {celebration && <CelebrationOverlay key={celebration.id} open title={celebration.title} message={celebration.message} variant={celebration.variant} level={celebration.level} onComplete={() => setCelebration(undefined)} />}
    <Box component="section" ref={region} aria-labelledby="sample-case-label" onKeyDown={onKeyDown}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={2} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id="sample-case-label" component="h2" sx={type.label}>Case {index + 1} of {cases.length}</Typography>
          <Typography sx={{ ...type.caption, mt: .5 }}>{subject} · {topic}</Typography>
        </Box>
        <Box component="nav" aria-label="Cases" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 1, flexShrink: 0 }}>
          {cases.map((item, position) => {
            const selected = attempt.responses[item.question.id]?.selectedChoiceId;
            const result = selected === undefined ? undefined : isCorrect(item.question, selected) ? 'correct' : 'incorrect';
            return <StudyNavigatorTile key={item.question.id} number={position + 1} label="Case" current={position === index} highlighted={false} flagged={false} status={result ?? 'unanswered'} result={result} onClick={() => go(position)} />;
          })}
        </Box>
      </Stack>
      <SwapTransition swapKey={index}>
        <QuestionCard key={question.id} question={question} response={response} showFeedback={response.locked} onSelect={select} burstOnCorrect keyboardShortcuts="scoped" shortcutsDisabled={Boolean(celebration)} />
      </SwapTransition>
      <StudyNavigationFooter index={index} total={cases.length} onPrevious={() => go(index - 1)} onNext={() => go(index + 1)} onFinish={onStart} finishLabel="Start studying" nextLabel={response.locked ? 'Continue' : 'Next'} />
      {answers.length === cases.length && <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Typography sx={type.caption}>You answered {correct.length} of {cases.length} correctly.</Typography>
        <Button size="small" onClick={restart} sx={{ p: 0, minWidth: 0 }}>Try again</Button>
      </Stack>}
    </Box>
  </>;
}
