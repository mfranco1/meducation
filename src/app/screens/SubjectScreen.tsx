import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import type { ScoreTrend } from '../../analytics/analytics';
import type { Attempt, FeedbackMode, Quiz, Subject } from '../../domain/types';
import { ScoreTrendIndicator } from '../components/ScoreTrendIndicator';
import { QuizSetupDialog } from '../components/quiz/QuizSetupDialog';

export interface QuizProgress {
  quiz: Quiz;
  active?: Attempt;
  completionCount: number;
  latestScore?: number;
  trend?: ScoreTrend;
  currentQuestion?: number;
}

export function SubjectScreen({ subject, progress, onBack, onResumeQuiz, onStartQuiz, onBrowseQuiz }: { subject: Subject; progress: QuizProgress[]; onBack: () => void; onResumeQuiz: (quiz: Quiz) => void; onStartQuiz: (quiz: Quiz, mode: FeedbackMode) => void; onBrowseQuiz: (quiz: Quiz) => void }) {
  const [setupQuiz, setSetupQuiz] = useState<Quiz | null>(null);

  return <Container maxWidth="md" sx={{ py: 5 }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">All subjects</Button>
    <Typography variant="h3" sx={{ mt: 3, mb: 4 }}>{subject.name}</Typography>
    <Stack spacing={2}>{progress.map(({ quiz, active, completionCount, latestScore, trend, currentQuestion }) => <Card key={quiz.id}><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
        <Box><Typography variant="h6">{quiz.name}</Typography>
          <Typography variant="body2" color="text.secondary">{active ? `Resume from question ${currentQuestion} of ${quiz.questionCount}` : `${quiz.questionCount} questions`}</Typography>
          {completionCount > 0 && <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label={`Completed ${completionCount} ${completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" />
            {latestScore !== undefined && <Chip label={<Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: .75 }}>Latest score {latestScore}%{trend && <ScoreTrendIndicator trend={trend} />}</Box>} size="small" variant="outlined" />}
          </Stack>}
        </Box>
        <Button variant="contained" onClick={() => active ? onResumeQuiz(quiz) : setSetupQuiz(quiz)}>{active ? 'Resume quiz' : completionCount > 0 ? 'Retake quiz' : 'Start quiz'}</Button>
      </Stack>
    </CardContent></Card>)}</Stack>
    {setupQuiz && <QuizSetupDialog open quiz={setupQuiz} onClose={() => setSetupQuiz(null)} onStart={(quiz, mode) => { onStartQuiz(quiz, mode); setSetupQuiz(null); }} onBrowse={quiz => { onBrowseQuiz(quiz); setSetupQuiz(null); }} />}
  </Container>;
}
