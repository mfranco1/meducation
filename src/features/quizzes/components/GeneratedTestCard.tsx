import { Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { radius } from '../../../shared/theme';
import type { QuizProgress } from '../selectors/progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { PastAttemptsDialog } from './quiz/PastAttemptsDialog';
import { QuizSetupDialog } from './quiz/QuizSetupDialog';

export interface GeneratedTestControls {
  progress: QuizProgress;
  busy?: boolean;
  attempts: readonly CompletedAttempt[];
  onStart: (quiz: Quiz, mode: FeedbackMode, shuffle: boolean) => void;
  onResume: (quiz: Quiz) => void;
  onReview: (quiz: Quiz, attempt: CompletedAttempt) => void;
  onPrepare?: (quiz: Quiz) => void;
}

/** A Subject Test or Mixed Test: a generated quiz with its own progress, kept apart from the subject's. */
export function GeneratedTestCard({
  progress: { quiz, active, completionCount, latestScore, trend, answeredCount },
  description,
  busy = false,
  attempts,
  onStart,
  onResume,
  onReview,
  onPrepare = () => undefined,
}: GeneratedTestControls & { description: string }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const label = active ? 'Resume' : completionCount > 0 ? 'Retake' : 'Start';
  const done = Math.min(answeredCount ?? 0, quiz.questionCount);
  return (
    <>
      <Card component="section" aria-label={quiz.name}>
        <CardContent
          sx={{
            alignItems: { sm: 'center' },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2">
              {quiz.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {description}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
              <Chip
                size="small"
                label={`${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}`}
              />
              {latestScore !== undefined && (
                <Chip
                  size="small"
                  label={
                    <Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: 1 }}>
                      Score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}
                    </Box>
                  }
                />
              )}
            </Stack>
            {active && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
                <LinearProgress
                  aria-hidden
                  variant="determinate"
                  value={quiz.questionCount ? (done / quiz.questionCount) * 100 : 0}
                  sx={{ borderRadius: radius.pill, flex: 1, maxWidth: 240 }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {`${done}/${quiz.questionCount} answered`}
                </Typography>
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {completionCount > 0 && (
              <Button
                variant="outlined"
                aria-label={`Review attempts: ${quiz.name}`}
                onClick={() => setReviewOpen(true)}
              >
                Review
              </Button>
            )}
            <Button
              variant="contained"
              aria-label={busy ? undefined : `${label} quiz: ${quiz.name}`}
              disabled={busy}
              onClick={() => {
                if (active) {
                  onResume(quiz);
                  return;
                }
                onPrepare(quiz);
                setSetupOpen(true);
              }}
            >
              {busy ? 'Loading questions…' : label}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {reviewOpen && (
        <PastAttemptsDialog
          quizName={quiz.name}
          attempts={attempts}
          onClose={() => setReviewOpen(false)}
          onSelect={(attempt) => {
            onReview(quiz, attempt);
            setReviewOpen(false);
          }}
        />
      )}
      {setupOpen && (
        <QuizSetupDialog
          open
          quiz={quiz}
          onClose={() => setSetupOpen(false)}
          onStart={(started, mode, shuffle) => {
            onStart(started, mode, shuffle);
            setSetupOpen(false);
          }}
          onBrowse={() => undefined}
        />
      )}
    </>
  );
}
