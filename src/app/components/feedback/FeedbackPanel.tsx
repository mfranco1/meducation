import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import { isCorrect } from '../../../domain/quizEngine';
import type { Question } from '../../../domain/types';
import { ExplanationContent } from './ExplanationContent';

export function FeedbackPanel({ question, selectedChoiceId }: { question: Question; selectedChoiceId?: string }) {
  const theme = useTheme();
  const correct = isCorrect(question, selectedChoiceId);
  const answerUnderReview = Boolean(question.rationaleMeta?.answerReviewNote);
  const tone = answerUnderReview ? theme.palette.feedback.review : correct ? theme.palette.feedback.correct : theme.palette.feedback.incorrect;
  const hasContent = Boolean(question.rationale || question.pearls?.length);
  return <Box aria-live="polite" sx={{ mt: 3, overflow: 'hidden', border: '1px solid', borderColor: tone.border, borderRadius: 1, bgcolor: 'background.paper' }}>
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, bgcolor: tone.surface, borderBottom: '1px solid', borderColor: tone.separator }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {answerUnderReview ? <WarningAmberRoundedIcon color="warning" /> : correct ? <CheckCircleRoundedIcon color="success" /> : <CancelRoundedIcon color="error" />}
        <Typography fontWeight={800}>{answerUnderReview ? 'Answer key under review' : correct ? 'Correct' : 'Not quite'}</Typography>
      </Stack>
    </Box>
    {hasContent && <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 2.75 } }}>
      <ExplanationContent question={question} />
      {question.pearls?.map(pearl => <Box key={pearl} sx={{ mt: 2.5, maxWidth: '72ch', p: 1.5, borderRadius: 2, bgcolor: 'primary.light' }}>
        <Typography variant="subtitle2" color="primary.dark">High-yield pearl</Typography>
        <Typography sx={{ mt: .5, lineHeight: 1.65 }}>{pearl}</Typography>
      </Box>)}
    </Box>}
  </Box>;
}
