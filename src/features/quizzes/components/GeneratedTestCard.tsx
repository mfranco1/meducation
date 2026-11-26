import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ShuffleRoundedIcon from '@mui/icons-material/ShuffleRounded';
import { useState, type ReactNode } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { fontWeight, radius } from '../../../shared/theme';
import type { QuizProgress } from '../selectors/progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { SubjectScoreSummary } from './SubjectScoreSummary';
import { PastAttemptsDialog } from './quiz/PastAttemptsDialog';
import { QuizSetupDialog } from './quiz/QuizSetupDialog';
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column-reverse', minWidth: 0 }}>
      <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="subtitle1"
        sx={{ alignItems: 'center', display: 'flex', fontWeight: fontWeight.semibold, gap: 0.75, m: 0 }}
      >
        {children}
      </Typography>
    </Box>
  );
}

/** A Subject Test or Mixed Test: a generated quiz with its own progress, kept apart from the subject's. */
export function GeneratedTestCard({
  progress: { quiz, active, completionCount, latestScore, trend },
  description,
  icon = <ShuffleRoundedIcon sx={{ fontSize: 28 }} />,
  subjectCount,
  busy = false,
  attempts,
  onStart,
  onResume,
  onReview,
  onPrepare = () => undefined,
}: GeneratedTestControls & {
  description?: string;
  icon?: ReactNode;
  /** Subjects the test draws from. When given, the card lists its facts in place of the score bar. */
  subjectCount?: number;
}) {
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
                {icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" component="h2">
                  {quiz.name}
                </Typography>
                {description && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {description}
                  </Typography>
                )}
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
          {subjectCount === undefined ? (
            <SubjectScoreSummary score={latestScore} trend={trend} activeCount={active ? 1 : 0} />
          ) : (
            <Box
              component="dl"
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'grid',
                gap: 2,
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                m: 0,
                pt: 2,
                '@container test-card (min-width: 480px)': {
                  gap: 0,
                  gridTemplateColumns: 'repeat(3, auto)',
                  justifyContent: 'space-between',
                },
              }}
            >
              <Fact label="Questions">{quiz.questionCount}</Fact>
              <Fact label="Subjects">{subjectCount}</Fact>
              <Fact label="Latest score">
                {latestScore === undefined ? '—' : `${latestScore}%`}
                {trend && <ScoreTrendIndicator trend={trend} />}
              </Fact>
            </Box>
          )}
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

/** Placeholder for the Mixed Test card while the catalog loads; it keeps the card's layout and lines. */
export function GeneratedTestCardSkeleton() {
  return (
    <Card aria-hidden="true" sx={{ display: 'flex', width: '100%' }}>
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
        <Box sx={{ alignItems: 'center', display: 'flex', gap: 2 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', flex: '1 1 0', gap: 1.5, minWidth: 0 }}>
            <LoadingSkeleton
              variant="rounded"
              width={48}
              height={48}
              sx={{ borderRadius: radius.badge, flexShrink: 0 }}
            />
            <LoadingSkeleton variant="text" width="40%" height={32} />
          </Box>
          <LoadingSkeleton
            variant="rounded"
            width={72}
            height={36}
            sx={{ borderRadius: radius.control, flexShrink: 0 }}
          />
        </Box>
        <Box
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            pt: 2,
          }}
        >
          {[0, 1, 2].map((fact) => (
            <Box key={fact} sx={{ flex: '0 1 88px' }}>
              <LoadingSkeleton variant="text" width="50%" height={28} />
              <LoadingSkeleton variant="text" width="100%" height={18} />
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
