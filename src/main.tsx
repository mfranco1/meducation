import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Alert, Button, CssBaseline, Container, ThemeProvider } from '@mui/material';
import { theme } from './shared/theme';
import { AppShell } from './shared/ui/shell/AppShell';
import { AppNavigationDrawer } from './app/components/AppNavigationDrawer';
import { ScreenLoading } from './shared/ui/loading/ScreenLoading';
import { brand } from './shared/brand';
import { hasStartedStudying, markStartedStudying } from './persistence/visitorStart';

function BootFailure() {
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        The app could not start. Reload to try again.
      </Alert>
    </Container>
  );
}

const root = createRoot(document.getElementById('root')!);
const showingAbout = new URLSearchParams(window.location.search).get('about') === '1';
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

const blockScroll = (event: Event) => {
  if (
    !(event instanceof KeyboardEvent) ||
    [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
  )
    event.preventDefault();
};
const scrollEvents = ['wheel', 'touchmove', 'keydown'] as const;

async function showLanding() {
  try {
    const [{ LandingPage }, { zoomIntoScreen }] = await Promise.all([
      import('./app/landing/LandingPage'),
      import('./app/landing/screenZoom'),
    ]);
    const appLayer = { current: null as HTMLDivElement | null };
    const landingLayer = { current: null as HTMLDivElement | null };
    // Both layers keep their positions in the tree so the app survives the landing page leaving.
    const layers = (app: ReactNode, landing: ReactNode) =>
      render(
        <>
          <div ref={(element) => void (appLayer.current = element)}>{app}</div>
          {landing && <div ref={(element) => void (landingLayer.current = element)}>{landing}</div>}
        </>,
      );
    const loadApp = () => import('./app/App');
    let starting = false;
    const landing = (
      <LandingPage
        onStart={(screen) => {
          if (starting) return;
          starting = true;
          markStartedStudying();
          if (showingAbout) {
            window.location.replace('/');
            return;
          }
          if (!screen) {
            window.scrollTo(0, 0);
            void boot();
            return;
          }
          void (async () => {
            const { default: App } = await loadApp();
            landingLayer.current!.inert = true;
            scrollEvents.forEach((name) => window.addEventListener(name, blockScroll, { passive: false }));
            try {
              const zoom = zoomIntoScreen(screen, landingLayer.current!, appLayer.current!);
              layers(<App />, landing);
              const finish = await zoom;
              flushSync(() => layers(<App />, null));
              window.scrollTo(0, 0);
              finish();
            } finally {
              scrollEvents.forEach((name) => window.removeEventListener(name, blockScroll));
            }
          })().catch((error) => {
            console.error('Start animation failed.', error);
            window.scrollTo(0, 0);
            void boot();
          });
        }}
      />
    );
    layers(null, landing);
    // Fetch the app early so the zoom starts the moment Start studying is pressed.
    const idle = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1500));
    idle(() => void loadApp().catch(() => undefined));
  } catch (error) {
    console.error('Landing page could not load.', error);
    void boot();
  }
}

if (!showingAbout && hasStartedStudying()) void boot();
else void showLanding();
