import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { ContentLoadError } from '../../content/runtimeQuestionBank';

export function ContentLoadFailure({ title, error, onRetry }: { title: string; error?: Error; onRetry: () => void }) {
  const revisionConflict = error instanceof ContentLoadError && error.kind === 'revision';
  return <Card variant="outlined" role="alert" sx={{ bgcolor: 'background.paper', borderColor: 'divider', height: '100%' }}>
    <CardContent>
      <Stack spacing={1.5} alignItems="flex-start">
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        <Typography color="text.secondary" variant="body2">{error?.message ?? 'Please try again or come back later.'}</Typography>
        <Button variant="contained" onClick={onRetry}>{revisionConflict ? 'Reload content' : 'Retry'}</Button>
      </Stack>
    </CardContent>
  </Card>;
}
