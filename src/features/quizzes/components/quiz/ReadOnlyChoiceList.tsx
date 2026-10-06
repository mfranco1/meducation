import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import type { Question } from '../../../../domain/types';
import { MarkdownContent } from '../../../../shared/ui/content/MarkdownContent';

export function ReadOnlyChoiceList({ question, selectedChoiceId, correctChoiceId, answerUnderReview = false, mode }: {
  question: Question;
  selectedChoiceId?: string;
  correctChoiceId?: string;
  answerUnderReview?: boolean;
  mode: 'browse' | 'review';
}) {
  const theme = useTheme();
  return <Stack spacing={1.25} role="list" aria-label="Answer choices" sx={{ mt: 3 }}>
    {question.choices.map(choice => {
      const selected = mode === 'review' && choice.id === selectedChoiceId;
      const correct = !answerUnderReview && choice.id === correctChoiceId;
      const marked = mode === 'browse' ? correct : selected;
      const incorrectSelection = selected && !correct && !answerUnderReview;
      const labels = [selected && 'Your answer', correct && 'Correct answer'].filter(Boolean).join(' · ');
      return <Box key={choice.id} role="listitem" aria-label={labels || undefined} sx={{
        border: '1px solid',
        borderColor: selected ? 'primary.main' : theme.palette.feedback.choiceBorder,
        bgcolor: correct ? theme.palette.feedback.correct.surface : incorrectSelection ? theme.palette.feedback.incorrect.surface : 'background.paper',
        borderRadius: 1,
        p: .5,
      }}>
        <Stack direction="row" alignItems="center" sx={{ minWidth: 0 }}>
          <Box aria-hidden="true" sx={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', color: correct ? 'success.main' : marked ? 'primary.main' : 'text.secondary' }}>
            {marked ? <RadioButtonCheckedIcon sx={{ fontSize: 21 }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 21 }} />}
          </Box>
          <Typography component="div" sx={{ py: .8, minWidth: 0, lineHeight: 1.5 }}>
            <b>{choice.id}.</b> <MarkdownContent markdown={choice.text} variant="inline" />
          </Typography>
        </Stack>
      </Box>;
    })}
  </Stack>;
}
