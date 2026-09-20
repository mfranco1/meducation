import { Alert, Box, Card, CardContent, Chip, Container, Stack, Typography } from '@mui/material';
import { questions, quizzes, subjects } from '../content/questionBank';
import { validateQuestionBank } from '../content/validate';
import { validateQuestionExplanations } from '../content/explanationValidation';

/** Development-only inspection screen: visit `/#content-qa`. Source data remains edited in content files. */
export function ContentQaPanel() {
  const issues = [...validateQuestionBank(subjects, quizzes, questions), ...validateQuestionExplanations(questions)];
  return <Container maxWidth="lg" sx={{ py: 5 }}><Typography variant="overline" color="primary.main" fontWeight={800}>Developer tools</Typography><Typography variant="h3">Content QA</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Inspect the canonical question bank and validation results. Edit <code>src/content/questionBank.generated.json</code>, never in the learner UI.</Typography>
    <Stack spacing={1} sx={{ mt: 4 }}>{issues.length ? issues.map((issue, i) => <Alert key={i} severity={issue.level}>{issue.questionId ? `${issue.questionId}: ` : ''}{issue.message}</Alert>) : <Alert severity="success">No structural content errors found.</Alert>}</Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 2, mt: 4 }}>{questions.map(question => <Card key={question.id}><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>{question.id}</Typography><Chip size="small" label={question.metadata.topic ?? 'untagged'} /></Stack><Typography sx={{ mt: 2, whiteSpace:'pre-wrap' }}>{question.stem}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Answer source: {question.answerSource}{question.explanation?.answerReviewNote ? ' · answer under review' : ''}</Typography></CardContent></Card>)}</Box>
  </Container>;
}
