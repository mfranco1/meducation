import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import { useState } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { radius } from '../../../shared/theme';
import type { QuizProgress } from '../selectors/progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { PastAttemptsDialog } from './quiz/PastAttemptsDialog';
import { QuizSetupDialog } from './quiz/QuizSetupDialog';
import { ProgressTrack } from '../../../shared/ui/catalog/SubjectProgressSummary';
import { relativeTime } from '../../../shared/ui/catalog/TopicSetBrowser';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';

export interface GeneratedTestControls {
  progress: QuizProgress;
  busy?: boolean;
  attempts: readonly CompletedAttempt[];
  onStart: (quiz: Quiz, mode: FeedbackMode, shuffle: boolean) => void;
  onResume: (quiz: Quiz) => void;
  onReview: (quiz: Quiz, attempt: CompletedAttempt) => void;
  onPrepare?: (quiz: Quiz) => void;
}

const cardContentSx = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  gap: 2,
  justifyContent: 'space-between',
  minWidth: 0,
  p: 2.5,
  '&:last-child': { pb: 2.5 },
} as const;

const testIcon = (
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
    <QuizRoundedIcon sx={{ fontSize: 28 }} />
  </Box>
);

/** Review and Start, Resume or Retake for a generated test, with their dialogs. */
function TestActions({
  progress: { quiz, active, completionCount },
  busy = false,
  attempts,
  onStart,
  onResume,
  onReview,
  onPrepare = () => undefined,
}: GeneratedTestControls) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const label = active ? 'Resume' : completionCount > 0 ? 'Retake' : 'Start';
  return (
    <>
      <Stack className="test-card-actions" direction="row" spacing={1} sx={{ flexShrink: 0 }}>
        {completionCount > 0 && (
          <Button variant="outlined" aria-label={`Review attempts: ${quiz.name}`} onClick={() => setReviewOpen(true)}>
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

/** A generated test (Mixed Test or Subject Test) with its own progress and latest score. */
export function GeneratedTestCard({
  scope,
  id,
  ...controls
}: GeneratedTestControls & { scope: 'subjects' | 'topics'; id?: string }) {
  const { quiz, active, latestScore, trend, answeredCount = 0, activityAt } = controls.progress;
  return (
    <Card
      component="section"
      id={id}
      aria-label={quiz.name}
      sx={{ containerName: 'test-card', containerType: 'inline-size', display: 'flex', width: '100%' }}
    >
      <CardContent sx={cardContentSx}>
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
            {testIcon}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2">
                {quiz.name}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {`${quiz.questionCount} questions across all ${scope}`}
              </Typography>
            </Box>
          </Box>
          <TestActions {...controls} />
        </Box>
        {latestScore !== undefined && (
          <Box>
            <Chip
              size="small"
              variant="outlined"
              label={
                <Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: 1 }}>
                  Score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}
                </Box>
              }
            />
          </Box>
        )}
        {active && <AnsweredProgress answered={answeredCount} total={quiz.questionCount} activityAt={activityAt} />}
      </CardContent>
    </Card>
  );
}

function AnsweredProgress({ answered, total, activityAt }: { answered: number; total: number; activityAt?: string }) {
  const percent = total ? Math.round((answered / total) * 100) : 0;
  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <ProgressTrack percent={percent} sx={{ flex: 1 }} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {percent}%
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {`${Math.min(answered, total)}/${total} answered`}
        </Typography>
        {activityAt && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {relativeTime(activityAt)}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

/** Placeholder for the Mixed Test card while the catalog loads; it keeps the card's layout and lines. */
export function GeneratedTestCardSkeleton() {
  return (
    <Card aria-hidden="true" sx={{ display: 'flex', width: '100%' }}>
      <CardContent sx={cardContentSx}>
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 2 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', flex: '1 1 0', gap: 1.5, minWidth: 0 }}>
            <LoadingSkeleton
              variant="rounded"
              width={48}
              height={48}
              sx={{ borderRadius: radius.badge, flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <LoadingSkeleton variant="text" width="40%" height={32} />
              <LoadingSkeleton variant="text" width="60%" height={20} />
            </Box>
          </Box>
          <LoadingSkeleton
            variant="rounded"
            width={72}
            height={36}
            sx={{ borderRadius: radius.control, flexShrink: 0 }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
