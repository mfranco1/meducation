import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { FeedbackMode, Quiz, Subject } from '../../domain/types';
import { ScoreTrendIndicator } from '../components/ScoreTrendIndicator';
import { QuizSetupDialog } from '../components/quiz/QuizSetupDialog';
import type { QuizProgress } from '../progress';
import { ContentLoadFailure } from '../components/ContentLoadFailure';
import { ContentRecoveryBanner } from '../components/ContentRecoveryBanner';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { SubjectBrowseLayout } from '../components/SubjectBrowseLayout';
export type { QuizProgress } from '../progress';

export function SubjectScreen({ subject, progress, loading = false, retrying = false, recovery, loadingQuizIds = new Set<string>(), error, questionError, onRetry = () => undefined, onRetryQuestions = () => undefined, onBack, onResumeQuiz, onStartQuiz, onBrowseQuiz }: { subject: Subject; progress: QuizProgress[]; loading?: boolean; retrying?: boolean; recovery?: { failed: boolean; retryAt?: number; retryAfterAt?: number; retrying: boolean; busy: boolean }; loadingQuizIds?: Set<string>; error?: Error; questionError?: Error; onRetry?: () => void; onRetryQuestions?: () => void; onBack: () => void; onResumeQuiz: (quiz: Quiz) => void; onStartQuiz: (quiz: Quiz, mode: FeedbackMode) => void; onBrowseQuiz: (quiz: Quiz) => void }) {
  const [setupQuiz, setSetupQuiz] = useState<Quiz | null>(null);

  return <>
    {recovery?.failed && <ContentRecoveryBanner error={error} retrying={recovery.retrying} busy={recovery.busy} retryAt={recovery.retryAt} title={`We can’t load quizzes for ${subject.name} right now.`} description="Your saved quiz history is safe. Please try again." onRetry={onRetry} />}
    <SubjectBrowseLayout subjectName={subject.name} onBack={onBack}>
    {questionError && <Box sx={{ mb: 3 }}><ContentLoadFailure title="Failed to load questions" error={questionError} onRetry={onRetryQuestions} /></Box>}
    {error || loading || retrying ? <Stack role={error && !retrying && !loading ? undefined : 'status'} spacing={2} aria-busy={loading || retrying} aria-hidden={Boolean(error && !retrying && !loading)} aria-label={retrying ? 'Retrying quizzes' : 'Loading quizzes'}>{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} variant="rounded" height={92} />)}</Stack> : <Stack spacing={2}>{progress.map(({ quiz, active, completionCount, latestScore, trend, currentQuestion }) => <Card key={quiz.id}><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
        <Box><Typography variant="h6">{quiz.name}</Typography>
          <Typography variant="body2" color="text.secondary">{active ? `Resume from question ${currentQuestion} of ${quiz.questionCount}` : `${quiz.questionCount} questions`}</Typography>
          {completionCount > 0 && <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label={`Completed ${completionCount} ${completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" />
            {latestScore !== undefined && <Chip label={<Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: .75 }}>Latest score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}</Box>} size="small" variant="outlined" />}
          </Stack>}
        </Box>
        <Button variant="contained" disabled={loadingQuizIds.has(quiz.id)} onClick={() => active ? onResumeQuiz(quiz) : setSetupQuiz(quiz)}>{loadingQuizIds.has(quiz.id) ? 'Loading questions…' : active ? 'Resume quiz' : completionCount > 0 ? 'Retake quiz' : 'Start quiz'}</Button>
      </Stack>
    </CardContent></Card>)}{progress.length === 0 && <Typography color="text.secondary">No quizzes are available in this subject yet.</Typography>}</Stack>}
    {setupQuiz && <QuizSetupDialog open quiz={setupQuiz} onClose={() => setSetupQuiz(null)} onStart={(quiz, mode) => { onStartQuiz(quiz, mode); setSetupQuiz(null); }} onBrowse={quiz => { onBrowseQuiz(quiz); setSetupQuiz(null); }} />}
    </SubjectBrowseLayout>
  </>;
}
