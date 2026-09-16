import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Box, Stack, Typography } from '@mui/material';
import { explanationFor } from '../../../content/explanationCatalog';
import { isCorrect } from '../../../domain/quizEngine';
import type { Question } from '../../../domain/types';
import { ExplanationContent } from './ExplanationContent';

export function FeedbackPanel({ question, selectedChoiceId }: { question: Question; selectedChoiceId?: string }) {
  const correct = isCorrect(question, selectedChoiceId);
  const answerUnderReview = Boolean(explanationFor(question)?.answerReviewNote);
  const statusBackground = answerUnderReview ? '#fff4dd' : correct ? '#e4f2e9' : '#fae9e6';
  const hasContent = Boolean(explanationFor(question) || question.pearls?.length);
  return <Box aria-live="polite" sx={{ mt: 3, overflow: 'hidden', border: '1px solid', borderColor: answerUnderReview ? '#e9cf98' : correct ? '#b9dec6' : '#f0c6bf', borderRadius: 1, bgcolor: 'background.paper' }}>
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, bgcolor: statusBackground, borderBottom: '1px solid', borderColor: answerUnderReview ? '#f0dcaf' : correct ? '#cce6d5' : '#f3d3cd' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {answerUnderReview ? <WarningAmberRoundedIcon color="warning" /> : correct ? <CheckCircleRoundedIcon color="success" /> : <CancelRoundedIcon color="error" />}
        <Typography fontWeight={800}>{answerUnderReview ? 'Answer key under review' : correct ? 'Correct' : 'Not quite'}</Typography>
      </Stack>
    </Box>
    {hasContent && <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 2.75 } }}>
      <ExplanationContent question={question} />
      {question.pearls?.map(pearl => <Box key={pearl} sx={{ mt: 2.5, maxWidth: '72ch', p: 1.5, borderRadius: 2, bgcolor: '#f7dfcf' }}>
        <Typography variant="subtitle2" color="primary.dark">High-yield pearl</Typography>
        <Typography sx={{ mt: .5, lineHeight: 1.65 }}>{pearl}</Typography>
      </Box>)}
    </Box>}
  </Box>;
}
