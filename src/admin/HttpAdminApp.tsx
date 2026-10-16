import { useCallback, useEffect, useRef, useState } from 'react';
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
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { AppBrand } from '../shared/ui/brand/AppBrand';
import { AdminHeader } from './components/AdminHeader';
import { AdminExportDialog, type ExportTarget } from './components/AdminExportDialog';
import { AdminVersionsDialog } from './components/AdminVersionsDialog';
import { workspaceStatus, type AdminDraftState } from './core/workspaceStatus';
import { ScreenLoading } from '../shared/ui/loading/ScreenLoading';
import { AdminWorkspace } from './AdminWorkspace';
import { HttpQuestionBankGateway } from './data/HttpQuestionBankGateway';
import { PairedHttpClient, expectedContext, type PairedSnapshot, type ServerPreview } from './data/PairedHttpClient';

const client = new PairedHttpClient();
type Review = {
  action: 'publish' | 'activate';
  releaseId?: string;
  reason: string;
  expected: ReturnType<typeof expectedContext>;
  preview: ServerPreview;
};
export default function HttpAdminApp() {
  const [gateway, setGateway] = useState<HttpQuestionBankGateway>();
  const [session, setSession] = useState(client.session);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('Reviewed paired publication');
  const [releases, setReleases] = useState<Array<{ releaseId: string; latestPublicationSequence: string }>>([]);
  const [releaseCursor, setReleaseCursor] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState('');
  const [review, setReview] = useState<Review>();
  const [task, setTask] = useState<'publish' | 'activate' | 'export' | 'versions' | 'status'>();
  const [dirty, setDirty] = useState<AdminDraftState>({ quizzes: false, flashcards: false });
  const [notice, setNotice] = useState('');
  const [exportInitial, setExportInitial] = useState<ExportTarget>('draft');
  const reviewGeneration = useRef(0);
  const running = useRef(false);
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [pulse, setPulse] = useState(0);
  const unsaved = useRef(false);
  const popup = useRef<Window | undefined>(undefined);
  const reportDirty = useCallback((value: AdminDraftState) => {
    unsaved.current = value.quizzes || value.flashcards;
    reviewGeneration.current += 1;
    setDirty(value);
    setReview(undefined);
  }, []);
  const run = async (action: () => Promise<void>, allowInFlight = false) => {
    if (running.current || (!allowInFlight && client.inFlight)) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Editor request failed. Your text is kept.');
      setReview(undefined);
    } finally {
      running.current = false;
      setBusy(false);
      setPulse((p) => p + 1);
    }
  };
  const bootstrap = async () => {
    const status = await client.refreshSession();
    setSession(status);
    if (!gateway && status.authenticated)
      setGateway(new HttpQuestionBankGateway(client, await client.get<PairedSnapshot>('/draft')));
    gateway?.invalidate();
    setReview(undefined);
  };
  useEffect(() => {
    let active = true;
    void client
      .refreshSession()
      .then(async (status) => {
        if (!active) return;
        setSession(status);
        if (status.authenticated) {
          const pair = await client.get<PairedSnapshot>('/draft');
          if (active) setGateway(new HttpQuestionBankGateway(client, pair));
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
  useEffect(
    () =>
      gateway?.subscribe(() => {
        reviewGeneration.current += 1;
        setReview(undefined);
        setPulse((p) => p + 1);
      }),
    [gateway],
  );
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
      void run(bootstrap);
    };
    addEventListener('message', complete);
    return () => removeEventListener('message', complete);
  });
  // Account actions remain available during an editor write and never replay that write.
  const login = () =>
    run(async () => {
      setReview(undefined);
      gateway?.invalidate();
      popup.current = await client.authenticate(Boolean(session?.authenticated));
    }, true);
  const reconcile = () =>
    run(async () => {
      const result = await client.reconcile();
      if (gateway) await gateway.refresh();
      setNotice(
        result.committed
          ? 'The operation committed. Current context loaded; your unsaved text is kept. Review again.'
          : 'No committed receipt was found. Refresh context and preview again before a new write.',
      );
    });
  const publicationPreview = (action: Review['action']) =>
    run(async () => {
      if (!gateway || unsaved.current)
        throw new Error('Save or explicitly discard unsaved edits in both sections before publication review.');
      const generation = reviewGeneration.current;
      const expected = expectedContext(gateway.current);
      const preview = await client.post<ServerPreview>(
        action === 'publish' ? '/publish/preview' : `/releases/${releaseId}/activation-preview`,
        { expected, reason },
      );
      if (reviewGeneration.current !== generation) throw new Error('The review changed. Preview again.');
      setReview({ action, releaseId: action === 'activate' ? releaseId : undefined, reason, expected, preview });
    });
  const confirmPublication = () =>
    run(async () => {
      if (!gateway || !review || unsaved.current || review.reason !== reason)
        throw new Error('The review changed. Preview again.');
      const receipt = await client.mutate<{ snapshot: PairedSnapshot }>(
        review.action === 'publish' ? '/publish' : `/releases/${review.releaseId}/activate`,
        { expected: review.expected, reason: review.reason, previewFingerprint: review.preview.previewFingerprint },
      );
      await gateway.accept(receipt.snapshot);
      setReview(undefined);
      setTask(undefined);
      setNotice(
        review.action === 'publish'
          ? 'Published quizzes and flashcards. Learners can see this version.'
          : 'Published version activated. The saved draft is preserved.',
      );
    });
  const exportPair = (target: ExportTarget) =>
    run(async () => {
      if (!gateway) return;
      const exportRelease = target === 'current' ? gateway.current.publication.releaseId : releaseId;
      if (target !== 'draft' && !exportRelease) throw new Error('Choose a published version to export.');
      const body =
        target !== 'draft'
          ? { target: 'release', releaseId: exportRelease }
          : {
              target: 'draft',
              expected: expectedContext(gateway.current),
              draftRevision: gateway.current.draft.revision,
            };
      const blob = await client.export(body);
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
  const recovering = Boolean(client.pending && !client.inFlight);
  const status = gateway ? workspaceStatus(gateway.current, dirty, recovering) : undefined;
  const blocked = busy || client.inFlight || recovering;
  const loadVersions = (cursor?: string) =>
    run(async () => {
      const page = await client.get<{ releases: typeof releases; nextCursor: string | null }>(
        '/releases' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      );
      setReleases(page.releases);
      setReleaseCursor(page.nextCursor);
      setReleaseId('');
    });
  const closeTask = () => {
    setTask(undefined);
    setReview(undefined);
  };
  const header =
    gateway && status ? (
      <AdminHeader
        status={status.label}
        publishBlocked={status.publishBlocked}
        busy={blocked}
        accountBusy={busy}
        undoAvailable={gateway.current.undo.available}
        publicationAvailable={Boolean(gateway.current.publication.releaseId)}
        onStatus={() => setTask('status')}
        onPublish={() => {
          setReview(undefined);
          setTask('publish');
        }}
        onExport={() => {
          setExportInitial('draft');
          setTask('export');
        }}
        onVersions={() => {
          setTask('versions');
          void loadVersions();
        }}
        onRefresh={() =>
          void run(async () => {
            await gateway.refresh();
          })
        }
        onUndo={() =>
          void run(async () => {
            if (
              window.confirm(
                `Undo paired draft ${gateway.current.draft.revision} to saved snapshot ${gateway.current.undo.targetRevision}? This changes both banks without publishing. Unsaved text is kept for review.`,
              )
            )
              await gateway.undo();
          })
        }
        onReset={() =>
          void run(async () => {
            if (
              window.confirm(
                `Reset both draft banks at revision ${gateway.current.draft.revision} to publication ${gateway.current.publication.sequence}? Displaced saved content is retained in history. Unsaved text is kept.`,
              )
            )
              await gateway.reset();
          })
        }
        onLogin={() => void login()}
        onLogout={() =>
          void run(async () => {
            await client.post('/auth/logout', {});
            setSession(await client.refreshSession());
            gateway.invalidate();
            closeTask();
          }, true)
        }
        sessionDetails={
          <Typography variant="body2">
            {session?.authenticated ? 'Signed in' : 'Session expired'} ·{' '}
            {session?.fresh ? 'Authentication fresh' : 'Fresh authentication may be required'}
          </Typography>
        }
      />
    ) : undefined;
  const feedback = (
    <Stack spacing={1} sx={{ px: { xs: 2, sm: 3 }, pt: 1 }} data-state={pulse}>
      {recovering && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" disabled={busy} onClick={reconcile}>
              Check save status
            </Button>
          }
        >
          We could not confirm whether this saved. Check save status before another write.
        </Alert>
      )}
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
      {gateway && session && !session.authenticated && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" disabled={busy} onClick={login}>
              Sign in to continue
            </Button>
          }
        >
          Your session expired. Your editing text is kept.
        </Alert>
      )}
      {status?.staleBase && (
        <Alert severity="warning">
          The saved draft is based on an earlier publication. Review it before using Reset draft to published version.
        </Alert>
      )}
    </Stack>
  );
  return (
    <>
      {gateway ? (
        <AdminWorkspace gateway={gateway} header={header} feedback={feedback} onDirtyChange={reportDirty} />
      ) : (
        <Container sx={{ py: 6 }}>
          <Stack spacing={3} alignItems="flex-start">
            <AppBrand />
            <Typography variant="h5">Content admin</Typography>
            {(!session || session.authenticated) && !error ? (
              <ScreenLoading label={session?.authenticated ? 'Loading paired draft…' : 'Loading editor session…'} />
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
      {gateway && (
        <>
          {task === 'export' && (
            <AdminExportDialog
              open
              initialTarget={exportInitial}
              busy={busy}
              error={error}
              currentReleaseId={gateway.current.publication.releaseId}
              selectedReleaseId={releaseId}
              draftRevision={gateway.current.draft.revision}
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
            onSelect={(id) => {
              setReleaseId(id);
              setReview(undefined);
            }}
            onNext={() => void loadVersions(releaseCursor!)}
            onClose={closeTask}
            onExport={() => {
              setExportInitial('selected');
              setTask('export');
            }}
            onActivate={() => {
              setReview(undefined);
              setTask('activate');
            }}
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
                  {status?.draftChanged
                    ? 'Saved database draft differs from learner content.'
                    : 'Saved database draft matches learner content.'}
                </Typography>
                <Box component="details">
                  <summary>Technical details</summary>
                  <Typography sx={{ overflowWrap: 'anywhere' }}>
                    Draft {gateway.current.draft.revision} · publication {gateway.current.publication.sequence} ·
                    release {gateway.current.publication.releaseId ?? 'None'} · draft base{' '}
                    {gateway.current.draft.basePublicationSequence}
                  </Typography>
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeTask}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <Dialog
        open={task === 'publish' || task === 'activate'}
        onClose={busy ? undefined : closeTask}
        aria-labelledby="publication-review-title"
        fullWidth
        fullScreen={narrow}
      >
        <DialogTitle id="publication-review-title">
          {task === 'activate' ? 'Use published version' : 'Review & publish'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              {task === 'activate'
                ? `Use published version ${releaseId}. The saved draft is preserved.`
                : 'Publish the saved quizzes and flashcards together. Learners will see this version.'}
            </Typography>
            {status?.unsaved && <Alert severity="warning">{status.publishBlocked}</Alert>}
            <TextField
              label="Publication reason"
              value={reason}
              disabled={busy}
              onChange={(e) => {
                reviewGeneration.current += 1;
                setReason(e.target.value);
                setReview(undefined);
              }}
            />
            {error && <Alert severity="error">{error}</Alert>}
            {!review && (
              <Button
                disabled={blocked || !reason.trim() || Boolean(status?.unsaved)}
                onClick={() => void publicationPreview(task === 'activate' ? 'activate' : 'publish')}
              >
                Review {task === 'activate' ? 'activation' : 'publication'}
              </Button>
            )}
            {review && (
              <>
                <Typography>
                  Draft {review.expected.draftRevision} · publication {review.expected.publicationSequence}. Fresh
                  authentication is required.
                </Typography>
                <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(
                    {
                      counts: review.preview.counts,
                      affectedIds: review.preview.affectedIds,
                      totalAffected: review.preview.totalAffected,
                    },
                    null,
                    2,
                  )}
                </Box>
                {review.preview.validation.warnings > 0 && (
                  <Alert severity="warning">
                    {review.preview.validation.warnings} validation warning(s). Review editor validation before
                    publishing.
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={closeTask}>
            Cancel
          </Button>
          {review && (
            <Button disabled={blocked || Boolean(status?.unsaved)} onClick={confirmPublication}>
              Confirm {review.action === 'activate' ? 'activation' : 'publication'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
