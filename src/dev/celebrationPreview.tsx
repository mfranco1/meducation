import '@fontsource-variable/plus-jakarta-sans/wght.css';
// Dev-only page (npm run dev, then /celebrations.html) for replaying celebrations without taking a quiz.
import { Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompletedAttempt, StreakMilestone } from '../domain/types';
import { theme } from '../shared/theme';
import { ResultsScreen } from '../features/quizzes/screens/ResultsScreen';
import { CelebrationOverlay } from '../features/quizzes/components/celebration/CelebrationOverlay';
import {
  celebrationForStreak,
  perfectTestCelebration,
  type CelebrationEvent,
} from '../features/quizzes/components/celebration/celebrationCatalog';

const milestones: StreakMilestone[] = [3, 5, 10, 25, 50];
const quiz = { id: 'preview', subjectId: 'preview', topicId: 'preview', name: 'Preview', questionCount: 10 };
const resultPercentages = [45, 68, 82, 94, 100];
const attemptWith = (percentage: number): CompletedAttempt => ({
  id: 'preview',
  quizId: quiz.id,
  subjectId: quiz.subjectId,
  feedbackMode: 'immediate',
  elapsedMs: 300000,
  startedAt: new Date(0).toISOString(),
  completedAt: new Date(300000).toISOString(),
  responses: {},
  celebrationProgress: { correctStreak: 10, awardedStreakMilestones: [] },
  score: {
    correct: Math.round(percentage / 10),
    incorrect: 10 - Math.round(percentage / 10),
    unanswered: 0,
    total: 10,
    percentage,
    elapsedMs: 300000,
  },
});

function CelebrationPreview() {
  const [run, setRun] = useState(0);
  const [streak, setStreak] = useState<CelebrationEvent>();
  const [results, setResults] = useState<number>();
  const replay = (next: () => void) => {
    setRun((value) => value + 1);
    next();
  };
  return (
    <>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', p: 2, position: 'relative', zIndex: 1 }}>
        {milestones.map((milestone) => (
          <Button
            key={milestone}
            variant="outlined"
            onClick={() =>
              replay(() => {
                setResults(undefined);
                setStreak(celebrationForStreak(milestone));
              })
            }
          >
            {milestone} in a row
          </Button>
        ))}
        <Button
          variant="outlined"
          onClick={() =>
            replay(() => {
              setResults(undefined);
              setStreak(perfectTestCelebration());
            })
          }
        >
          Perfect test
        </Button>
        {resultPercentages.map((percentage) => (
          <Button
            key={percentage}
            variant="contained"
            onClick={() =>
              replay(() => {
                setStreak(undefined);
                setResults(percentage);
              })
            }
          >
            {percentage === 100 ? 'Perfect results' : `${percentage}% results`}
          </Button>
        ))}
      </Stack>
      {streak && (
        <CelebrationOverlay
          key={run}
          open
          title={streak.title}
          message={streak.message}
          variant={streak.variant}
          level={streak.level}
          onComplete={() => setStreak(undefined)}
        />
      )}
      {results !== undefined && (
        <ResultsScreen
          key={run}
          quiz={quiz}
          attempt={attemptWith(results)}
          questions={[]}
          onBack={() => setResults(undefined)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <CelebrationPreview />
  </ThemeProvider>,
);
