import { Box, Button, Card, CardContent, Container, LinearProgress, Stack, Typography } from '@mui/material';
import { keyframes } from '@emotion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { performanceBy } from '../../../analytics/analytics';
import { isPerfectScore } from '../../../domain/quizEngine';
import type { CompletedAttempt, Question, Quiz } from '../../../domain/types';
import { formatDuration } from '../format';
import { StatCard } from '../../../shared/ui/catalog/StatCard';
import { easing, reducedMotion, useReducedMotion } from '../../../shared/ui/motion';
import { ResultsScoreHero } from '../components/results/ResultsScoreHero';

const rise = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
`;

// Stages: 0 counting, 1 settled, 2 moving, 3 counts, 4 cards, 5 topic, 6 buttons, 7 done.
const doneStage = 7;
const dwellMs: Record<number, number> = { 1: 450, 2: 450, 3: 350, 4: 450, 5: 250, 6: 450 };

export function ResultsScreen({ attempt, questions, onBack, onReview }: { quiz: Quiz; attempt: CompletedAttempt; questions: Question[]; onBack: () => void; onReview?: () => void }) {
  const score = attempt.score;
  const rows = performanceBy(questions, [attempt], 'topic');
  const hasTopics = rows.length > 0;
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(reduced ? doneStage : 0);
  const [skipCount, setSkipCount] = useState(false);
  const [introOffset, setIntroOffset] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const nextStage = (current: number) => current === 4 && !hasTopics ? 6 : current + 1;
  const advance = () => {
    if (stage === 0) setSkipCount(true);
    else if (stage < doneStage) setStage(nextStage(stage));
  };
  useLayoutEffect(() => {
    if (stage >= doneStage || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setIntroOffset(window.innerHeight / 2 - (rect.top + rect.height / 2));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stage < 1 || stage >= doneStage) return;
    const timer = setTimeout(() => setStage(nextStage(stage)), dwellMs[stage]);
    return () => clearTimeout(timer);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stage >= doneStage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      advance();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  const shown = (n: number, delayMs = 0) => stage >= n
    ? { animation: `${rise} 420ms ${easing.out} ${delayMs}ms both`, [reducedMotion]: { animation: 'none' } }
    : { visibility: 'hidden' as const };
  return <>
    <Box onClick={advance} sx={{ flex: 1, minHeight: '100%' }}>
    <Container maxWidth="md" sx={{ py: 7 }}>
    <Stack alignItems="center" textAlign="center"><Box ref={heroRef} sx={{ transform: stage < 2 ? `translateY(${introOffset}px) scale(1.25)` : 'none', transformOrigin: 'center', transition: `transform 550ms ${easing.standard}`, [reducedMotion]: { transform: 'none', transition: 'none' } }}><ResultsScoreHero key={attempt.id} percentage={score.percentage} perfect={isPerfectScore(score)} skip={skipCount} onSettled={() => setStage(current => current === 0 ? 1 : current)} /></Box><Typography color="text.secondary" sx={{ mt: 1, ...shown(3) }}>{score.correct} correct · {score.incorrect} incorrect · {score.unanswered} unanswered</Typography></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 5 }}>
      <StatCard label="Total time" value={formatDuration(score.elapsedMs)} variant="results" sx={shown(4)} />
      <StatCard label="Average / question" value={formatDuration(score.total ? score.elapsedMs / score.total : 0)} variant="results" sx={shown(4, 120)} />
      <StatCard label="Score" value={`${score.correct} / ${score.total}`} variant="results" sx={shown(4, 240)} />
    </Stack>
    {hasTopics && <Card sx={{ mt: 3, ...shown(5) }}><CardContent><Typography variant="h6">Performance by topic</Typography>{rows.map(row => <Box key={row.label} sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between"><Typography>{row.label}</Typography><Typography fontWeight={700}>{row.correct}/{row.total} · {row.percentage}%</Typography></Stack><LinearProgress variant="determinate" value={row.percentage} sx={{ mt: .75 }} /></Box>)}</CardContent></Card>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4, ...shown(6) }}>
      {attempt.feedbackMode === 'exam' && onReview && <Button variant="contained" onClick={onReview}>Review results</Button>}
      <Button variant={attempt.feedbackMode === 'exam' && onReview ? 'outlined' : 'contained'} onClick={onBack}>Back to quizzes</Button>
    </Stack>
    </Container>
    </Box>
    {stage < doneStage && <Typography aria-hidden="true" variant="caption" color="text.secondary" sx={{ position: 'fixed', bottom: 16, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>Tap to skip</Typography>}
  </>;
}
