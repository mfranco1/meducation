import { Box, Stack, Typography } from '@mui/material';
import type { Question } from '../../../../domain/types';
import { MarkdownContent } from '../../../../shared/ui/content/MarkdownContent';

export function ChoiceExplanations({ question }: { question: Question }) {
  if (!Object.keys(question.choiceExplanations ?? {}).length) return null;
  return <Box sx={{ mt: 3 }}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>Choice explanations</Typography>
    <Stack spacing={1}>{Object.entries(question.choiceExplanations ?? {}).map(([choiceId, explanation]) => <Typography component="div" key={choiceId} variant="body2"><b>{choiceId}.</b> <MarkdownContent markdown={explanation} variant="inline" /></Typography>)}</Stack>
  </Box>;
}
