import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
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
  const [pulse, setPulse] = useState(0);
  const unsaved = useRef(false);
  const popup = useRef<Window | undefined>(undefined);
  const reportDirty = useCallback((value: boolean) => {
    unsaved.current = value;
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Editor request failed. Your text is kept.');
      setReview(undefined);
    } finally {
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
  const login = () =>
    run(async () => {
      setReview(undefined);
      gateway?.invalidate();
      popup.current = await client.authenticate(Boolean(session?.authenticated));
    });
  const reconcile = () =>
    run(async () => {
      const result = await client.reconcile();
      if (gateway) await gateway.refresh();
      setError(
        result.committed
          ? 'The operation committed. Current context loaded; your unsaved text is kept. Review again.'
          : 'No committed receipt was found. Refresh context and preview again before a new write.',
      );
    });
  const publicationPreview = (action: Review['action']) =>
    run(async () => {
      if (!gateway || unsaved.current)
        throw new Error('Save or explicitly discard unsaved edits in both sections before publication review.');
      const expected = expectedContext(gateway.current);
      const preview = await client.post<ServerPreview>(
        action === 'publish' ? '/publish/preview' : `/releases/${releaseId}/activation-preview`,
        { expected, reason },
      );
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
    });
  const exportPair = () =>
    run(async () => {
      if (!gateway) return;
      const body = releaseId
        ? { target: 'release', releaseId }
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
        link.download = releaseId ? 'meducation-release.zip' : 'meducation-unpublished-draft.zip';
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
  const controls = (
    <Stack spacing={1} aria-label="Paired draft controls" data-state={pulse} sx={{ maxWidth: 850 }}>
      <Typography variant="body2">
        {gateway
          ? `Paired draft ${gateway.current.draft.revision} · publication ${gateway.current.publication.sequence} · ${gateway.current.draft.digests.quizRevision === gateway.current.publication.digests?.quizRevision && gateway.current.draft.digests.flashcardRevision === gateway.current.publication.digests?.flashcardRevision ? 'Published' : 'Saved draft · unpublished'}`
          : 'Private editor'}{' '}
        · {session?.authenticated ? 'Signed in' : 'Sign in required'}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button disabled={busy} onClick={login}>
          {session?.authenticated ? 'Refresh authentication' : 'Sign in'}
        </Button>
        <Button disabled={busy} onClick={() => void run(bootstrap)}>
          Refresh session
        </Button>
        {gateway && (
          <>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await gateway.refresh();
                })
              }
            >
              Refresh draft context
            </Button>
            <Button disabled={busy || client.inFlight || !client.pending} onClick={reconcile}>
              Reconcile operation
            </Button>
            <Button
              disabled={busy || !gateway.current.undo.available}
              onClick={() =>
                void run(async () => {
                  if (
                    window.confirm(
                      `Undo paired draft ${gateway.current.draft.revision} to saved snapshot ${gateway.current.undo.targetRevision}? This changes both banks without publishing. Unsaved text is kept for review.`,
                    )
                  )
                    await gateway.undo();
                })
              }
            >
              Undo saved batch
            </Button>
            <Button
              disabled={busy || !gateway.current.publication.releaseId}
              onClick={() =>
                void run(async () => {
                  if (
                    window.confirm(
                      `Reset both draft banks at revision ${gateway.current.draft.revision} to publication ${gateway.current.publication.sequence}? Displaced saved content is retained in history. Unsaved text is kept.`,
                    )
                  )
                    await gateway.reset();
                })
              }
            >
              Reset paired draft
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await client.post('/auth/logout', {});
                  setSession(await client.refreshSession());
                  gateway.invalidate();
                })
              }
            >
              Sign out
            </Button>
          </>
        )}
      </Stack>
      {gateway && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
          <TextField
            label="Publication reason"
            size="small"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReview(undefined);
            }}
          />
          <Button disabled={busy || !reason.trim()} onClick={() => void publicationPreview('publish')}>
            Review publication
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const page = await client.get<{ releases: typeof releases; nextCursor: string | null }>('/releases');
                setReleases(page.releases);
                setReleaseCursor(page.nextCursor);
                setReleaseId('');
              })
            }
          >
            Load retained releases
          </Button>
          {releaseCursor && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const page = await client.get<{ releases: typeof releases; nextCursor: string | null }>(
                    '/releases?cursor=' + encodeURIComponent(releaseCursor),
                  );
                  setReleases(page.releases);
                  setReleaseCursor(page.nextCursor);
                  setReleaseId('');
                })
              }
            >
              Next retained releases
            </Button>
          )}
          <TextField
            select
            label="Retained release"
            size="small"
            value={releaseId}
            onChange={(e) => {
              setReleaseId(e.target.value);
              setReview(undefined);
            }}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          >
            <option value="">Draft export</option>
            {releases.map((r) => (
              <option key={r.releaseId} value={r.releaseId}>
                {r.releaseId}
              </option>
            ))}
          </TextField>
          <Button disabled={busy || !releaseId} onClick={() => void publicationPreview('activate')}>
            Review activation
          </Button>
          <Button disabled={busy} onClick={exportPair}>
            Export paired ZIP
          </Button>
        </Stack>
      )}
    </Stack>
  );
  return (
    <>
      {gateway ? (
        <AdminWorkspace gateway={gateway} controls={controls} onDirtyChange={reportDirty} />
      ) : (
        <Container sx={{ py: 6 }}>
          {!session && !error ? <ScreenLoading label="Loading editor session…" /> : controls}
        </Container>
      )}
      <Dialog
        open={Boolean(review)}
        onClose={() => setReview(undefined)}
        aria-labelledby="publication-review-title"
        fullWidth
      >
        <DialogTitle id="publication-review-title">
          {review?.action === 'activate' ? 'Activate retained release' : 'Publish paired draft'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            Draft {review?.expected.draftRevision} · publication {review?.expected.publicationSequence}.{' '}
            {review?.reason}
          </Typography>
          <Typography>
            {review?.action === 'activate'
              ? 'Activation preserves the unpublished draft.'
              : 'Publish both banks as the active paired release.'}{' '}
            Fresh authentication is required.
          </Typography>
          {review && (
            <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(
                {
                  counts: review.preview.counts,
                  affectedIds: review.preview.affectedIds,
                  totalAffected: review.preview.totalAffected,
                },
                null,
                2,
              )}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReview(undefined)}>Cancel</Button>
          <Button disabled={busy} onClick={confirmPublication}>
            Confirm {review?.action === 'activate' ? 'activation' : 'publication'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
