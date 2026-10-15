import { lazy, Suspense } from 'react';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
const Completion = lazy(() => import('./SessionCompletion').then((m) => ({ default: m.SessionCompletion })));
const Editor = lazy(() => import('./HttpAdminApp'));
export function AdminApp() {
  return (
    <Suspense fallback={<ScreenLoading label="Loading editor…" />}>
      {window.name === 'meducation-admin-login' ? <Completion /> : <Editor />}
    </Suspense>
  );
}
