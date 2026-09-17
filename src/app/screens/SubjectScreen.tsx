import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import type { Attempt, Quiz, Subject } from '../../domain/types';

export interface QuizProgress {
  quiz: Quiz;
  active?: Attempt;
  completionCount: number;
  lowestScore?: number;
  currentQuestion?: number;
}

export function SubjectScreen({ subject, progress, onBack, onOpenQuiz }: { subject: Subject; progress: QuizProgress[]; onBack: () => void; onOpenQuiz: (quiz: Quiz) => void }) {
  return <Container maxWidth="md" sx={{ py: 5 }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">All subjects</Button>
    <Typography variant="h3" sx={{ mt: 3, mb: 4 }}>{subject.name}</Typography>
    <Stack spacing={2}>{progress.map(({ quiz, active, completionCount, lowestScore, currentQuestion }) => <Card key={quiz.id}><CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
        <Box><Typography variant="h6">{quiz.name}</Typography>
          <Typography variant="body2" color="text.secondary">{quiz.status === 'ready'
            ? active ? `Resume from question ${currentQuestion} of ${quiz.questionCount}` : `${quiz.questionCount} questions`
            : 'Content awaiting review'}</Typography>
          {completionCount > 0 && <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label={`Completed ${completionCount} ${completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" />
            {lowestScore !== undefined && <Chip label={`Lowest score ${lowestScore}%`} size="small" variant="outlined" />}
          </Stack>}
        </Box>
        <Button variant="contained" disabled={quiz.status !== 'ready'} onClick={() => onOpenQuiz(quiz)}>{quiz.status === 'ready' ? active ? 'Resume test' : 'Start quiz' : 'Not ready'}</Button>
      </Stack>
    </CardContent></Card>)}</Stack>
  </Container>;
}
