import { Box, Button, ButtonBase, Card, CardContent, Collapse, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { useState, type ReactNode } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz } from '../../../domain/types';
import { focusRingInset, fontWeight, radius } from '../../../shared/theme';
import type { QuizProgress } from '../selectors/progress';
import { ScoreTrendIndicator } from './ScoreTrendIndicator';
import { PastAttemptsDialog } from './quiz/PastAttemptsDialog';
import { QuizSetupDialog } from './quiz/QuizSetupDialog';
import { ProgressTrack } from '../../../shared/ui/catalog/SubjectProgressSummary';
import { relativeTime } from '../../../shared/ui/catalog/TopicSetBrowser';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';
import { reducedMotion } from '../../../shared/ui/motion';

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

/** The Mixed Test: a generated quiz with its own progress, listed as facts. */
export function GeneratedTestCard({ subjectCount, ...controls }: GeneratedTestControls & { subjectCount: number }) {
  const { quiz, latestScore, trend } = controls.progress;
  return (
    <Card
      component="section"
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
            <Typography variant="h6" component="h2" sx={{ minWidth: 0 }}>
              {quiz.name}
            </Typography>
          </Box>
          <TestActions {...controls} />
        </Box>
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
      </CardContent>
    </Card>
  );
}

function Detail({ icon: Icon, children }: { icon: SvgIconComponent; children: ReactNode }) {
  return (
    <Typography
      component="li"
      variant="body2"
      sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', gap: 1, whiteSpace: 'nowrap' }}
    >
      <Icon aria-hidden color="primary" fontSize="small" />
      {children}
    </Typography>
  );
}

/** A Subject Test: collapsed to its name until opened, and open from the start while an attempt is unfinished. */
export function SubjectTestCard(controls: GeneratedTestControls) {
  const { quiz, active, latestScore, trend, answeredCount = 0, activityAt } = controls.progress;
  const [expanded, setExpanded] = useState(Boolean(active));
  const percent = quiz.questionCount ? Math.round((answeredCount / quiz.questionCount) * 100) : 0;
  return (
    <Card
      component="section"
      aria-label={quiz.name}
      sx={{ containerName: 'test-card', containerType: 'inline-size', width: '100%' }}
    >
      <Box component="h2" sx={{ m: 0 }}>
        <ButtonBase
          aria-expanded={expanded}
          aria-controls="subject-test-details"
          onClick={() => setExpanded(!expanded)}
          sx={{
            borderRadius: 'inherit',
            gap: 1.5,
            justifyContent: 'flex-start',
            p: 2.5,
            textAlign: 'left',
            width: '100%',
            '&.Mui-focusVisible': { ...focusRingInset },
          }}
        >
          {testIcon}
          <Typography variant="h6" component="span" sx={{ flex: 1, minWidth: 0 }}>
            {quiz.name}
          </Typography>
          <ExpandMoreRoundedIcon
            aria-hidden
            color="action"
            sx={{
              transform: expanded ? 'rotate(180deg)' : undefined,
              transition: (theme) => theme.transitions.create('transform', { duration: 180 }),
              [reducedMotion]: { transition: 'none' },
            }}
          />
        </ButtonBase>
      </Box>
      <Collapse id="subject-test-details" in={expanded} unmountOnExit sx={{ [reducedMotion]: { transition: 'none' } }}>
        <Stack
          spacing={2}
          sx={{
            px: 2.5,
            pb: 2.5,
            // From this width the details line up under the name, past the icon.
            '@container test-card (min-width: 480px)': { pl: 10 },
            '@container test-card (max-width: 419px)': { '& .test-card-actions': { width: '100%' } },
          }}
        >
          <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box
              component="ul"
              sx={{
                display: 'flex',
                flex: '1 1 0',
                flexWrap: 'wrap',
                columnGap: 3,
                rowGap: 1,
                listStyle: 'none',
                m: 0,
                p: 0,
              }}
            >
              <Detail icon={ArticleOutlinedIcon}>
                {quiz.questionCount} {quiz.questionCount === 1 ? 'question' : 'questions'}
              </Detail>
              <Detail icon={LayersOutlinedIcon}>All topics</Detail>
              {latestScore !== undefined && (
                <Detail icon={EmojiEventsOutlinedIcon}>
                  Latest score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}
                </Detail>
              )}
              {activityAt && !active && <Detail icon={ScheduleRoundedIcon}>{relativeTime(activityAt)}</Detail>}
            </Box>
            <TestActions {...controls} />
          </Box>
          {active && (
            <Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <ProgressTrack percent={percent} sx={{ flex: 1 }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {percent}%
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {`${Math.min(answeredCount, quiz.questionCount)}/${quiz.questionCount} answered`}
                </Typography>
                {activityAt && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {relativeTime(activityAt)}
                  </Typography>
                )}
              </Stack>
            </Box>
          )}
        </Stack>
      </Collapse>
    </Card>
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
