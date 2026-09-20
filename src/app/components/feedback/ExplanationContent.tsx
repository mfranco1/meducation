import { Alert, Box, Typography } from '@mui/material';
import { MarkdownContent } from '../content/MarkdownContent';
import type { Question } from '../../../domain/types';

export function ExplanationContent({ question }: { question: Question }) {
  const metadata = question.rationaleMeta;
  return <Box sx={{ maxWidth: '72ch' }}>
    <Typography variant="subtitle2" sx={{ mb: .75, color: 'text.secondary', letterSpacing: '.02em', textTransform: 'uppercase' }}>Explanation</Typography>
    {metadata?.answerReviewNote && <Alert severity="warning" sx={{ mb: 2 }}>Source answer under review: {metadata.answerReviewNote}</Alert>}
    <MarkdownContent markdown={question.rationale} />
    {metadata?.sources && <Box component="details" sx={{ mt: 2.5, borderTop: '1px solid', borderColor: 'divider', pt: 1.5, '& summary': { cursor: 'pointer', fontWeight: 700, color: 'text.secondary' } }}>
      <Box component="summary">Sources</Box>
      <Box sx={{ mt: 1, '& p': { fontSize: '.875rem' } }}><MarkdownContent markdown={metadata.sources} /></Box>
    </Box>}
  </Box>;
}
