import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ShuffleRoundedIcon from '@mui/icons-material/ShuffleRounded';
import { useState } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { radius } from '../../../shared/theme';
import type { QuizProgress } from '../selectors/progress';
import { SubjectScoreSummary } from './SubjectScoreSummary';
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
  progress: { quiz, active, completionCount, latestScore, trend },
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
  return (
    <>
      <Card
        component="section"
        aria-label={quiz.name}
        sx={{ containerName: 'test-card', containerType: 'inline-size', display: 'flex', width: '100%' }}
      >
        <CardContent
          sx={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            gap: 2,
            justifyContent: 'space-between',
            minWidth: 0,
            p: 2.5,
            '&:last-child': { pb: 2.5 },
          }}
        >
          <Box
            sx={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              '@container test-card (max-width: 419px)': { '& .test-card-actions': { width: '100%' } },
            }}
          >
            <Box sx={{ alignItems: 'center', display: 'flex', flex: '1 1 0', gap: 1.5, minWidth: 0 }}>
              <Box
                aria-hidden="true"
                sx={{
                  alignItems: 'center',
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.07),
                  borderRadius: radius.badge,
                  color: 'primary.main',
                  display: 'flex',
                  flex: '0 0 48px',
                  height: 48,
                  justifyContent: 'center',
                }}
              >
                <ShuffleRoundedIcon sx={{ fontSize: 28 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" component="h2">
                  {quiz.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {description}
                </Typography>
              </Box>
            </Box>
            <Stack className="test-card-actions" direction="row" spacing={1} sx={{ flexShrink: 0 }}>
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
          </Box>
          <SubjectScoreSummary score={latestScore} trend={trend} activeCount={active ? 1 : 0} />
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
