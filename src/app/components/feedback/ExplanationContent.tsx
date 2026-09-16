import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { explanationFor } from '../../../content/explanationCatalog';
import { parseExplanation } from '../../../content/explanationParser';
import type { ExplanationBlock } from '../../../content/explanationTypes';
import type { Question } from '../../../domain/types';

function InlineExplanationText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return <>{parts.map((part, index): ReactNode => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  })}</>;
}

function ExplanationList({ block }: { block: Extract<ExplanationBlock, { type: 'list' }> }) {
  return <Box component={block.ordered ? 'ol' : 'ul'} sx={{ my: 0, pl: 3, '& li + li': { mt: .65 } }}>{block.items.map((item, itemIndex) => <li key={itemIndex}>
    <Typography component="span" sx={{ lineHeight: 1.7 }}><InlineExplanationText text={item.text} /></Typography>
    {item.children?.map((child, childIndex) => child.type === 'list'
      ? <Box key={childIndex} sx={{ mt: .65 }}><ExplanationList block={child} /></Box>
      : <Typography key={childIndex} sx={{ mt: .65, lineHeight: 1.7 }}><InlineExplanationText text={child.text} /></Typography>)}
  </li>)}</Box>;
}

export function ExplanationContent({ question }: { question: Question }) {
  const explanation = explanationFor(question);
  if (!explanation) return null;
  return <Box sx={{ maxWidth: '72ch' }}>
    <Typography variant="subtitle2" sx={{ mb: .75, color: 'text.secondary', letterSpacing: '.02em', textTransform: 'uppercase' }}>Explanation</Typography>
    {explanation.answerReviewNote && <Alert severity="warning" sx={{ mb: 2 }}>Source answer under review: {explanation.answerReviewNote}</Alert>}
    <Stack spacing={1.25}>{parseExplanation(explanation.markdown).map((block, index) => block.type === 'paragraph'
      ? <Typography key={index} sx={{ fontSize: { xs: '1rem', sm: '1.0625rem' }, lineHeight: 1.75 }}><InlineExplanationText text={block.text} /></Typography>
      : <ExplanationList key={index} block={block} />
    )}</Stack>
    {explanation.sources && <Box component="details" sx={{ mt: 2.5, borderTop: '1px solid', borderColor: 'divider', pt: 1.5, '& summary': { cursor: 'pointer', fontWeight: 700, color: 'text.secondary' } }}>
      <Box component="summary">Sources</Box>
      <Typography component="div" variant="body2" sx={{ mt: 1, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{explanation.sources}</Typography>
    </Box>}
  </Box>;
}
