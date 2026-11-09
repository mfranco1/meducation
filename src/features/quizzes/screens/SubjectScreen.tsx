import { Box, Button, Stack } from '@mui/material';
import { useState } from 'react';
import type { CompletedAttempt, FeedbackMode, Quiz, Subject, Topic } from '../../../domain/types';
import { ScoreTrendIndicator } from '../components/ScoreTrendIndicator';
import { PastAttemptsDialog } from '../components/quiz/PastAttemptsDialog';
import { QuizSetupDialog } from '../components/quiz/QuizSetupDialog';
import type { QuizProgress } from '../selectors/progress';
import { ContentLoadFailure } from '../../../shared/ui/loading/ContentLoadFailure';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { TopicSetBrowser, TopicSetBrowserSkeleton, type TopicSet } from '../../../shared/ui/catalog/TopicSetBrowser';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';
export type { QuizProgress } from '../selectors/progress';

export function SubjectScreen({
  subject,
  topics,
  progress,
  continueStudying = false,
  loading = false,
  retrying = false,
  recovery,
  loadingQuizIds = new Set<string>(),
  error,
  questionError,
  onRetry = () => undefined,
  onRetryQuestions = () => undefined,
  attemptsFor = () => [],
  onReviewAttempt = () => undefined,
  onResumeQuiz,
  onStartQuiz,
  onBrowseQuiz,
  onPrepareQuiz = () => undefined,
}: {
  subject: Subject;
  topics: readonly Topic[];
  progress: QuizProgress[];
  continueStudying?: boolean;
  loading?: boolean;
  retrying?: boolean;
  recovery?: { failed: boolean; retryAt?: number; retryAfterAt?: number; retrying: boolean; busy: boolean };
  loadingQuizIds?: Set<string>;
  error?: Error;
  questionError?: Error;
  onRetry?: () => void;
  onRetryQuestions?: () => void;
  attemptsFor?: (quizId: string) => readonly CompletedAttempt[];
  onReviewAttempt?: (quiz: Quiz, attempt: CompletedAttempt) => void;
  onResumeQuiz: (quiz: Quiz) => void;
  onStartQuiz: (quiz: Quiz, mode: FeedbackMode, shuffle: boolean) => void;
  onBrowseQuiz: (quiz: Quiz) => void;
  onPrepareQuiz?: (quiz: Quiz) => void;
}) {
  const [setupQuiz, setSetupQuiz] = useState<Quiz | null>(null);
  const [reviewQuiz, setReviewQuiz] = useState<Quiz | null>(null);
  const sets: TopicSet[] = progress.map(
    ({ quiz, active, completionCount, latestScore, trend, answeredCount, activityAt }) => {
      const label = active ? 'Resume' : completionCount > 0 ? 'Retake' : 'Start';
      const busy = loadingQuizIds.has(quiz.id);
      return {
        id: quiz.id,
        topicId: quiz.topicId,
        name: quiz.name,
        detail: `${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}`,
        completionCount,
        activityAt,
        progress: active
          ? { done: Math.min(answeredCount ?? 0, quiz.questionCount), total: quiz.questionCount, label: 'answered' }
          : undefined,
        chips: [
          ...(latestScore !== undefined
            ? [
                <Box key="score" component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: 1 }}>
                  Score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}
                </Box>,
              ]
            : []),
        ],
        action: (
          <Stack direction="row" spacing={1}>
            {completionCount > 0 && (
              <Button
                variant="outlined"
                aria-label={`Review attempts: ${quiz.name}`}
                onClick={() => setReviewQuiz(quiz)}
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
                  onResumeQuiz(quiz);
                  return;
                }
                onPrepareQuiz(quiz);
                setSetupQuiz(quiz);
              }}
            >
              {busy ? 'Loading questions…' : label}
            </Button>
          </Stack>
        ),
      };
    },
  );

  const initialSetId = continueStudying
    ? progress.filter((item) => item.active).sort((a, b) => (b.activityAt ?? '').localeCompare(a.activityAt ?? ''))[0]
        ?.quiz.id
    : undefined;

  return (
    <>
      {recovery?.failed && (
        <ContentRecoveryBanner
          error={error}
          retrying={recovery.retrying}
          busy={recovery.busy}
          retryAt={recovery.retryAt}
          title={`We can’t load quizzes for ${subject.name} right now.`}
          description="Your saved quiz history is safe. Please try again."
          onRetry={onRetry}
        />
      )}
      {questionError && (
        <Box sx={{ mb: 3 }}>
          <ContentLoadFailure title="Failed to load questions" error={questionError} onRetry={onRetryQuestions} />
        </Box>
      )}
      {error || loading || retrying ? (
        <Box
          role={error && !retrying && !loading ? undefined : 'status'}
          aria-busy={loading || retrying}
          aria-hidden={Boolean(error && !retrying && !loading)}
          aria-label={retrying ? 'Retrying quizzes' : 'Loading quizzes'}
        >
          <TopicSetBrowserSkeleton noun="quiz" dashed={Boolean(error && !retrying && !loading)} />
        </Box>
      ) : progress.length === 0 ? (
        <SubjectCatalogEmptyState title="No quizzes available yet" />
      ) : (
        <TopicSetBrowser topics={topics} sets={sets} noun="quiz" initialSetId={initialSetId} />
      )}
      {reviewQuiz && (
        <PastAttemptsDialog
          quizName={reviewQuiz.name}
          attempts={attemptsFor(reviewQuiz.id)}
          onClose={() => setReviewQuiz(null)}
          onSelect={(attempt) => {
            onReviewAttempt(reviewQuiz, attempt);
            setReviewQuiz(null);
          }}
        />
      )}
      {setupQuiz && (
        <QuizSetupDialog
          open
          quiz={setupQuiz}
          onClose={() => setSetupQuiz(null)}
          onStart={(quiz, mode, shuffle) => {
            onStartQuiz(quiz, mode, shuffle);
            setSetupQuiz(null);
          }}
          onBrowse={(quiz) => {
            onBrowseQuiz(quiz);
            setSetupQuiz(null);
          }}
        />
      )}
    </>
  );
}
