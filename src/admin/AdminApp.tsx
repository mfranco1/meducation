import { lazy, Suspense } from 'react';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
const Completion = lazy(() => import('./SessionCompletion').then((m) => ({ default: m.SessionCompletion })));
const Editor = lazy(() => {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_ADMIN_SOURCE === 'json' &&
    import.meta.env.VITE_JSON_FIXTURE_AUTHORING === 'true'
  )
    return import('./LocalAdminApp');
  return import('./HttpAdminApp');
});
export function AdminApp() {
  return (
    <Suspense fallback={<ScreenLoading label="Loading editor…" />}>
      {window.name === 'meducation-admin-login' ? <Completion /> : <Editor />}
    </Suspense>
  );
}
