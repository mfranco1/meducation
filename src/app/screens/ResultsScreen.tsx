import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Box, Button, Card, CardContent, Container, LinearProgress, Stack, Typography } from '@mui/material';
import { performanceBy } from '../../analytics/analytics';
import type { CompletedAttempt, Question, Quiz } from '../../domain/types';
import { formatDuration } from '../format';
import { StatCard } from '../components/StatCard';

export function ResultsScreen({ quiz, attempt, questions, onBack }: { quiz: Quiz; attempt: CompletedAttempt; questions: Question[]; onBack: () => void }) {
  const score = attempt.score;
  const rows = performanceBy(questions, [attempt], 'topic');
  return <Container maxWidth="md" sx={{ py: 7 }}>
    <Stack alignItems="center" textAlign="center"><CheckCircleRoundedIcon color="success" sx={{ fontSize: 50 }} /><Typography variant="overline" color="primary.main" fontWeight={800} sx={{ mt: 1 }}>Quiz complete</Typography><Typography variant="h2">{score.percentage}%</Typography><Typography color="text.secondary">{score.correct} correct · {score.incorrect} incorrect · {score.unanswered} unanswered</Typography></Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 5 }}>
      <StatCard label="Total time" value={formatDuration(score.elapsedMs)} variant="results" />
      <StatCard label="Average / question" value={formatDuration(score.total ? score.elapsedMs / score.total : 0)} variant="results" />
      <StatCard label="Score" value={`${score.correct} / ${score.total}`} variant="results" />
    </Stack>
    {rows.length > 0 && <Card sx={{ mt: 3 }}><CardContent><Typography variant="h6">Performance by topic</Typography>{rows.map(row => <Box key={row.label} sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between"><Typography>{row.label}</Typography><Typography fontWeight={700}>{row.correct}/{row.total} · {row.percentage}%</Typography></Stack><LinearProgress variant="determinate" value={row.percentage} sx={{ mt: .75 }} /></Box>)}</CardContent></Card>}
    <Button variant="contained" sx={{ mt: 4 }} onClick={onBack}>Back to quizzes</Button>
  </Container>;
}
