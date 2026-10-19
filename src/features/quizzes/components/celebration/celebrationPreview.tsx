// Dev-only page (npm run dev, then /celebrations.html) for replaying celebrations without taking a quiz.
import { Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompletedAttempt, StreakMilestone } from '../../../../domain/types';
import { theme } from '../../../../shared/theme';
import { ResultsScreen } from '../../screens/ResultsScreen';
import { CelebrationOverlay } from './CelebrationOverlay';
import { celebrationForStreak, perfectTestCelebration, type CelebrationEvent } from './celebrationCatalog';

const milestones: StreakMilestone[] = [3, 5, 10, 25, 50];
const quiz = { id: 'preview', subjectId: 'preview', topicId: 'preview', name: 'Preview', questionCount: 10 };
const perfectAttempt: CompletedAttempt = {
  id: 'preview', quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: 'immediate', elapsedMs: 300000, startedAt: new Date(0).toISOString(), completedAt: new Date(300000).toISOString(),
  responses: {}, celebrationProgress: { correctStreak: 10, awardedStreakMilestones: [] }, score: { correct: 10, incorrect: 0, unanswered: 0, total: 10, percentage: 100, elapsedMs: 300000 },
};

function CelebrationPreview() {
  const [run, setRun] = useState(0);
  const [streak, setStreak] = useState<CelebrationEvent>();
  const [results, setResults] = useState(false);
  const replay = (next: () => void) => { setRun(value => value + 1); next(); };
  return <>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ p: 2, position: 'relative', zIndex: 1 }}>
      {milestones.map(milestone => <Button key={milestone} variant="outlined" onClick={() => replay(() => { setResults(false); setStreak(celebrationForStreak(milestone)); })}>{milestone} in a row</Button>)}
      <Button variant="outlined" onClick={() => replay(() => { setResults(false); setStreak(perfectTestCelebration()); })}>Perfect test</Button>
      <Button variant="contained" onClick={() => replay(() => { setStreak(undefined); setResults(true); })}>Perfect results</Button>
    </Stack>
    {streak && <CelebrationOverlay key={run} open title={streak.title} message={streak.message} variant={streak.variant} level={streak.level} onComplete={() => setStreak(undefined)} />}
    {results && <ResultsScreen key={run} quiz={quiz} attempt={perfectAttempt} questions={[]} onBack={() => setResults(false)} />}
  </>;
}

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><CelebrationPreview /></ThemeProvider>);
