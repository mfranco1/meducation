import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Box, Button, CircularProgress, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { theme } from './app/theme';
import { loadRuntimeContent, runtimeQuestionBank } from './content/runtimeQuestionBank';

const root = createRoot(document.getElementById('root')!);
const render = (content: ReactNode) => root.render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />{content}</ThemeProvider></StrictMode>,
);

function Loading() {
  return <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress aria-label="Loading quiz catalog" /></Box>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', mt: 10, px: 3 }}>
    <Typography variant="h5">Quiz content is unavailable</Typography>
    <Alert severity="error">{message}</Alert>
    <Button variant="contained" onClick={onRetry}>Retry</Button>
  </Stack>;
}

async function boot() {
  render(<Loading />);
  try {
    if (import.meta.env.DEV && location.hash === '#content-qa') {
      const local = await import('./content/questionBank');
      runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
      const { ContentQaPanel } = await import('./qa/ContentQaPanel');
      render(<ContentQaPanel />);
      return;
    }
    await loadRuntimeContent();
    const { default: App } = await import('./app/App');
    render(<App />);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The content service could not be reached.';
    render(<LoadError message={message} onRetry={() => void boot()} />);
  }
}

void boot();
