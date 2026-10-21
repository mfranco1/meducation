import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { AppBrand } from '../shared/ui/brand/AppBrand';
import { AdminChangesDialog } from './components/AdminChangesDialog';
import { AdminRecoveryBanner } from './components/AdminRecoveryBanner';
import { AdminHeader } from './components/AdminHeader';
import { AdminExportDialog, type ExportTarget } from './components/AdminExportDialog';
import { AdminPublishDiff } from './components/AdminPublishDiff';
import { AdminVersionsDialog } from './components/AdminVersionsDialog';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
import { AdminWorkspace } from './AdminWorkspace';
import { counts, DraftStore, type ReleaseSummary } from './data/DraftStore';
import { PairedHttpClient } from './data/PairedHttpClient';
import { workspaceStatus, type AdminDraftState } from './core/workspaceStatus';

const client = new PairedHttpClient();
type Task = 'publish' | 'activate' | 'discard' | 'export' | 'versions' | 'status' | 'changes';
export default function HttpAdminApp() {
  const [store, setStore] = useState<DraftStore>();
  const [session, setSession] = useState(client.session);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [releaseCursor, setReleaseCursor] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState('');
  const [task, setTask] = useState<Task>();
  const [dirty, setDirty] = useState<AdminDraftState>({ quizzes: false, flashcards: false });
  const [notice, setNotice] = useState('');
  const [exportInitial, setExportInitial] = useState<ExportTarget>('draft');
  const running = useRef(false);
  const sessionRefreshQueued = useRef(false);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [pulse, setPulse] = useState(0);
  const popup = useRef<Window | undefined>(undefined);
  /** 'command' admits one command here; 'gateway' actions are store calls that admit themselves. */
  const run = async (action: () => Promise<void>, mode: 'command' | 'gateway' | 'account' = 'command') => {
    if (running.current || (mode !== 'account' && client.commandBusy)) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      if (mode === 'command') await client.runCommand(action);
      else await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Editor request failed. Your text is kept.');
    } finally {
      running.current = false;
      setBusy(false);
      setPulse((p) => p + 1);
      // Only the session read may be queued after authentication; content writes never replay.
      if (sessionRefreshQueued.current) void run(bootstrap, 'account');
    }
  };
  const bootstrap = async () => {
    sessionRefreshQueued.current = false;
    const status = await client.refreshSession();
    setSession(status);
    if (!status.authenticated) return;
    if (store) await store.refresh();
    else setStore(await DraftStore.open(client));
  };
  useEffect(() => {
    let active = true;
    void client
      .refreshSession()
      .then(async (status) => {
        if (!active) return;
        setSession(status);
        if (status.authenticated) {
          const opened = await DraftStore.open(client);
          if (active) setStore(opened);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => client.subscribe(() => setPulse((p) => p + 1)), []);
  useEffect(() => store?.subscribe(() => setPulse((p) => p + 1)), [store]);
  useEffect(() => {
    const complete = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== popup.current ||
        event.data !== 'meducation-admin-auth-complete'
      )
        return;
      popup.current?.close();
      popup.current = undefined;
      sessionRefreshQueued.current = true;
      if (!running.current) void run(bootstrap, 'account');
    };
    addEventListener('message', complete);
    return () => removeEventListener('message', complete);
  });
  // Account actions remain available during an editor write and never replay that write.
  const login = () =>
    run(async () => {
      popup.current = await client.authenticate(Boolean(session?.authenticated));
    }, 'account');
  const publish = () =>
    run(async () => {
      const result = await store!.publish();
      setTask(undefined);
      setNotice(
        result.published
          ? 'Published quizzes and flashcards. Learners can see this version.'
          : 'There was nothing new to publish; learners already see this version.',
      );
    }, 'gateway');
  const activate = () =>
    run(async () => {
      await store!.activate(releaseId);
      setTask(undefined);
      setNotice('Published version activated. The draft is preserved.');
    }, 'gateway');
  const discard = () =>
    run(async () => {
      await store!.discard();
      setTask(undefined);
      setNotice('Unpublished changes discarded. The draft matches the published version.');
    }, 'gateway');
  const revert = (change: Parameters<DraftStore['revert']>[0]) =>
    run(async () => {
      await store!.revert(change);
      setNotice(`Reverted change #${change.changeId}.`);
    }, 'gateway');
  const exportPair = (target: ExportTarget) =>
    run(async () => {
      if (!store) return;
      const exportRelease = target === 'current' ? store.snapshot.activeReleaseId : releaseId;
      if (target !== 'draft' && !exportRelease) throw new Error('Choose a published version to export.');
      const blob = await client.export(
        target !== 'draft' ? { target: 'release', releaseId: exportRelease } : { target: 'draft' },
      );
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = target !== 'draft' ? 'meducation-release.zip' : 'meducation-unpublished-draft.zip';
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
  const status = store ? workspaceStatus(store.snapshot, dirty) : undefined;
  const blocked = busy || client.commandBusy || client.authenticationRequired;
  const loadVersions = (cursor?: string) =>
    run(async () => {
      const page = await store!.releases(cursor);
      setReleases(page.releases);
      setReleaseCursor(page.nextCursor);
      setReleaseId('');
    });
  const closeTask = () => setTask(undefined);
  const header =
    store && status ? (
      <AdminHeader
        status={status.label}
        publishBlocked={status.publishBlocked}
        busy={blocked}
        accountBusy={busy}
        discardAvailable={store.snapshot.changed && store.snapshot.activeReleaseId !== null}
        onStatus={() => setTask('status')}
        onPublish={() => setTask('publish')}
        onExport={() => {
          setExportInitial('draft');
          setTask('export');
        }}
        onVersions={() => {
          setTask('versions');
          void loadVersions();
        }}
        onRefresh={() => void run(() => store.refresh())}
        onChanges={() => setTask('changes')}
        onDiscard={() => setTask('discard')}
        onLogin={() => void login()}
        onLogout={() =>
          void run(async () => {
            await client.post('/auth/logout', {});
            setSession(await client.refreshSession());
            closeTask();
          }, 'account')
        }
        sessionDetails={
          <Typography variant="body2">
            {client.authenticationRequired
              ? 'Sign in required'
              : session?.authenticated
                ? 'Signed in'
                : 'Session expired'}{' '}
            · {session?.fresh ? 'Authentication fresh' : 'Fresh authentication may be required'}
          </Typography>
        }
      />
    ) : undefined;
  const feedback = (
    <Stack spacing={1} sx={{ px: { xs: 2, sm: 3 }, pt: 1 }} data-state={pulse}>
      {client.authenticationRequired && <AdminRecoveryBanner busy={busy} onSignIn={() => void login()} />}
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="info" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {status?.staleBase && (
        <Alert severity="warning">
          The draft is based on an earlier publication than the one learners see. Publishing replaces what learners
          see with this draft; Discard unpublished changes starts the draft over from the published version.
        </Alert>
      )}
    </Stack>
  );
  const snapshot = store?.snapshot;
  const confirming = task === 'publish' || task === 'activate' || task === 'discard';
  return (
    <>
      {store ? (
        <AdminWorkspace store={store} header={header} feedback={feedback} externalBusy={blocked} onDirtyChange={setDirty} />
      ) : (
        <Container sx={{ py: 6 }}>
          <Stack spacing={3} alignItems="flex-start">
            <AppBrand />
            <Typography variant="h5">Content admin</Typography>
            {(!session || session.authenticated) && !error ? (
              <ScreenLoading label={session?.authenticated ? 'Loading draft…' : 'Loading editor session…'} />
            ) : (
              <>
                <Typography>Sign in to edit the private content draft.</Typography>
                {error && <Alert severity="error">{error}</Alert>}
                <Button variant="contained" disabled={busy} onClick={login}>
                  Sign in
                </Button>
              </>
            )}
          </Stack>
        </Container>
      )}
      {store && snapshot && (
        <>
          {task === 'export' && (
            <AdminExportDialog
              open
              initialTarget={exportInitial}
              busy={busy}
              error={error}
              currentReleaseId={snapshot.activeReleaseId}
              selectedReleaseId={releaseId}
              draftLabel={`(change ${snapshot.latestChangeId})`}
              onClose={closeTask}
              onExport={(target) => void exportPair(target)}
            />
          )}
          <AdminVersionsDialog
            open={task === 'versions'}
            busy={blocked}
            error={error}
            versions={releases}
            selected={releaseId}
            hasNext={Boolean(releaseCursor)}
            onSelect={setReleaseId}
            onNext={() => void loadVersions(releaseCursor!)}
            onClose={closeTask}
            onExport={() => {
              setExportInitial('selected');
              setTask('export');
            }}
            onActivate={() => setTask('activate')}
          />
          <AdminChangesDialog
            open={task === 'changes'}
            busy={blocked}
            error={error}
            latestChangeId={snapshot.latestChangeId}
            publishedChangeId={snapshot.publishedChangeId}
            load={(since, limit) => store.changes(since, limit)}
            onRevert={(change) => void revert(change)}
            onClose={closeTask}
          />
          <Dialog
            open={task === 'status'}
            onClose={closeTask}
            fullWidth
            fullScreen={narrow}
            aria-labelledby="workspace-status-title"
          >
            <DialogTitle id="workspace-status-title">Workspace status</DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                <Typography>Quizzes: {dirty.quizzes ? 'Unsaved edits in this browser' : 'No unsaved edits'}</Typography>
                <Typography>
                  Flashcards: {dirty.flashcards ? 'Unsaved edits in this browser' : 'No unsaved edits'}
                </Typography>
                <Typography>
                  {snapshot.changed
                    ? 'The draft has unpublished changes.'
                    : 'The draft matches what learners see.'}
                </Typography>
                <Box component="details">
                  <summary>Technical details</summary>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>
                    Latest change {snapshot.latestChangeId} · published through change {snapshot.publishedChangeId ?? 0}{' '}
                    · publication {snapshot.publicationSequence} · release {snapshot.activeReleaseId ?? 'None'} · draft
                    base {snapshot.baseReleaseId ?? 'None'}
                  </Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeTask}>Close</Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={confirming}
            onClose={busy ? undefined : closeTask}
            aria-labelledby="confirm-title"
            fullWidth
            maxWidth={task === 'publish' ? 'md' : 'sm'}
            fullScreen={narrow}
          >
            <DialogTitle id="confirm-title">
              {task === 'activate'
                ? 'Use published version'
                : task === 'discard'
                  ? 'Discard unpublished changes'
                  : 'Review & publish'}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                {task === 'publish' && (
                  <>
                    <Typography>
                      Publish the saved quizzes and flashcards together. Learners will see this version.
                    </Typography>
                    <Typography variant="body2" aria-label="Draft totals">
                      Draft totals:{' '}
                      {Object.entries(counts(snapshot))
                        .map(([kind, n]) => `${n} ${kind}`)
                        .join(' · ')}
                    </Typography>
                    {status?.unsaved && <Alert severity="warning">{status.publishBlocked}</Alert>}
                    <AdminPublishDiff store={store} />
                  </>
                )}
                {task === 'activate' && (
                  <Typography>{`Use published version ${releaseId}. The draft is preserved.`}</Typography>
                )}
                {task === 'discard' && (
                  <Typography>
                    Replace the draft with the published version
                    {snapshot.activeReleaseId ? ` ${snapshot.activeReleaseId}` : ''}. Every unpublished draft change is
                    removed from the draft. Unsaved editor text stays in this browser.
                  </Typography>
                )}
                <Typography variant="body2">Fresh authentication is required.</Typography>
                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={closeTask}>
                Cancel
              </Button>
              <Button
                color={task === 'discard' ? 'error' : 'primary'}
                disabled={blocked || (task === 'publish' && Boolean(status?.publishBlocked))}
                onClick={() => void (task === 'activate' ? activate() : task === 'discard' ? discard() : publish())}
              >
                {task === 'activate'
                  ? 'Confirm activation'
                  : task === 'discard'
                    ? 'Discard unpublished changes'
                    : 'Confirm publication'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </>
  );
}
