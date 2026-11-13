import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght-italic.css';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from '../shared/theme';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';

const Completion = lazy(() => import('./SessionCompletion').then((m) => ({ default: m.SessionCompletion })));
const Editor = lazy(() => import('./HttpAdminApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense fallback={<ScreenLoading label="Loading editor…" />}>
        {window.name === 'meducation-admin-login' ? <Completion /> : <Editor />}
      </Suspense>
    </ThemeProvider>
  </StrictMode>,
);
