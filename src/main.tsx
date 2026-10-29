import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, CssBaseline, Container, ThemeProvider } from '@mui/material';
import { theme } from './shared/theme';
import { AppShell } from './shared/ui/shell/AppShell';
import { AppNavigationDrawer } from './app/components/AppNavigationDrawer';
import { ScreenLoading } from './shared/ui/loading/ScreenLoading';
import { brand } from './shared/brand';
import { hasStartedStudying, markStartedStudying } from './persistence/visitorStart';

function BootFailure() {
  return <Container maxWidth="sm" sx={{ py: 6 }}>
    <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload</Button>}>
      The app could not start. Reload to try again.
    </Alert>
  </Container>;
}

const root = createRoot(document.getElementById('root')!);
const render = (content: ReactNode) =>
  root.render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {content}
      </ThemeProvider>
    </StrictMode>,
  );

async function boot() {
  try {
    render(
      <AppShell sidebar={<AppNavigationDrawer active="quizzes" disabled onNavigate={() => undefined} />} busy>
        <ScreenLoading label={`Loading ${brand.name}…`} />
      </AppShell>,
    );
    const { default: App } = await import('./app/App');
    render(<App />);
  } catch (error) {
    console.error('Application could not start.', error);
    render(
      <AppShell sidebar={<AppNavigationDrawer active="quizzes" disabled onNavigate={() => undefined} />}>
        <BootFailure />
      </AppShell>,
    );
  }
}

async function showLanding() {
  try {
    const { LandingPage } = await import('./app/landing/LandingPage');
    render(<LandingPage onStart={() => { markStartedStudying(); window.scrollTo(0, 0); void boot(); }} />);
  } catch (error) {
    console.error('Landing page could not load.', error);
    void boot();
  }
}

if (hasStartedStudying()) void boot();
else void showLanding();
