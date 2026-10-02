import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './app/theme';
import { runtimeQuestionBank } from './content/runtimeQuestionBank';

const root = createRoot(document.getElementById('root')!);
const render = (content: ReactNode) => root.render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />{content}</ThemeProvider></StrictMode>,
);

async function boot() {
  try {
    if (import.meta.env.DEV && location.hash === '#content-qa') {
      const local = await import('./content/questionBank');
      runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
      const { ContentQaPanel } = await import('./qa/ContentQaPanel');
      render(<ContentQaPanel />);
      return;
    }
    const { default: App } = await import('./app/App');
    render(<App />);
  } catch (error) {
    console.error('Application could not start.', error);
  }
}

void boot();
