import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './shared/theme';
import { runtimeQuestionBank } from './content/api/runtimeQuestionBank';
import { BootFailure } from './shared/ui/loading/BootFailure';
import { AppShell } from './shared/ui/shell/AppShell';
import { AppNavigationDrawer } from './app/components/AppNavigationDrawer';
import { ScreenLoading } from './shared/ui/loading/ScreenLoading';
import { brand } from './shared/brand';

const root = createRoot(document.getElementById('root')!);
const render = (content: ReactNode) => root.render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />{content}</ThemeProvider></StrictMode>,
);

async function boot() {
  try {
    if (import.meta.env.DEV && location.hash === '#content-qa') {
      const local = await import('./content/local/questionBank');
      runtimeQuestionBank.configureLocal(local.subjects, local.quizzes, local.questions);
      const { ContentQaPanel } = await import('./qa/ContentQaPanel');
      render(<ContentQaPanel />);
      return;
    }
    render(<AppShell sidebar={<AppNavigationDrawer active="quizzes" disabled onNavigate={() => undefined} />} busy><ScreenLoading label={`Loading ${brand.name}…`} /></AppShell>);
    const { default: App } = await import('./app/App');
    render(<App />);
  } catch (error) {
    console.error('Application could not start.', error);
    render(<AppShell sidebar={<AppNavigationDrawer active="quizzes" disabled onNavigate={() => undefined} />}><BootFailure /></AppShell>);
  }
}

void boot();
