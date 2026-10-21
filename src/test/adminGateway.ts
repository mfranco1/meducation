import { vi } from 'vitest';
import type { StoredFlashcardBank, StoredQuestionBank } from '../content/schema/schema';
import { DraftStore, type ApiKind, type DraftSnapshot } from '../admin/data/DraftStore';
import { PairedHttpClient } from '../admin/data/PairedHttpClient';

type Row = Record<string, unknown> & { id: string; version: number };
const KINDS: ApiKind[] = ['subjects', 'topics', 'quizzes', 'questions', 'decks', 'cards'];
const PARENT: Record<ApiKind, [string, ApiKind] | undefined> = {
  subjects: undefined,
  topics: ['subjectId', 'subjects'],
  quizzes: ['topicId', 'topics'],
  questions: ['quizId', 'quizzes'],
  decks: ['topicId', 'topics'],
  cards: ['deckId', 'decks'],
};
const CHILDREN: Record<ApiKind, ApiKind[]> = {
  subjects: ['topics'],
  topics: ['quizzes', 'decks'],
  quizzes: ['questions'],
  questions: [],
  decks: ['cards'],
  cards: [],
};
const PREFIX: Record<ApiKind, string> = { subjects: 's', topics: 't', quizzes: 'q', questions: 'i', decks: 'd-new', cards: 'f-new' };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const failure = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json({ error: { code, message: code, requestId: 'test', ...extra } }, status);

/**
 * A small in-memory fake of the record API behind a real `PairedHttpClient` and `DraftStore`:
 * sequential IDs (s91, t91, q91, i91, d-new91, f-new91), per-record versions, optimistic concurrency, cascade
 * deletes, a change log with revert, discard and publish. Content is not validated unless `rejectNext` is armed.
 */
export function createAdminStore(quizzes: StoredQuestionBank, flashcards: StoredFlashcardBank) {
  const initial = structuredClone({ ...quizzes, ...flashcards }) as unknown as Record<ApiKind, Row[]>;
  let rows = {} as Record<ApiKind, Row[]>;
  const load = () => {
    rows = Object.fromEntries(
      KINDS.map((kind) => [kind, structuredClone(initial[kind] ?? []).map((row) => ({ ...row, version: 1 }))]),
    ) as Record<ApiKind, Row[]>;
  };
  load();
  const changes: Array<Record<string, unknown>> = [];
  const counters: Record<string, number> = {};
  const state = { changed: false, publications: 1, published: 0, rejection: undefined as undefined | { issues: unknown[]; match: RegExp } };
  let hold: { match: RegExp; gate: Promise<void> } | undefined;
  const log = (kind: ApiKind, entityId: string, action: string, before: Row | null, after: Row | null) => {
    changes.push({
      changeId: changes.length + 1,
      createdAt: '2026-01-01T00:00:00Z',
      actor: 'tester',
      kind,
      entityId,
      action,
      before,
      after,
    });
    state.changed = true;
    return changes.length;
  };
  const nextId = (kind: ApiKind) => `${PREFIX[kind]}${91 + (counters[kind] = (counters[kind] ?? -1) + 1)}`;
  const find = (kind: ApiKind, id: string) => rows[kind].find((row) => row.id === id);
  const snapshot = (): DraftSnapshot => ({
    ...(structuredClone(rows) as unknown as Pick<DraftSnapshot, ApiKind>),
    changed: state.changed,
    latestChangeId: changes.length,
    publishedChangeId: state.published,
    baseReleaseId: 'release-1',
    activeReleaseId: 'release-1',
    publicationSequence: state.publications,
  });
  const insert = (kind: ApiKind, parentId: string | undefined, afterId: string | null | undefined, fields: object) => {
    const parent = PARENT[kind];
    const row: Row = { id: nextId(kind), ...(parent ? { [parent[0]]: parentId } : {}), ...fields, version: 1 };
    const siblings = rows[kind].filter((other) => !parent || other[parent[0]] === parentId);
    const anchor = afterId === null ? -1 : rows[kind].indexOf(afterId ? find(kind, afterId)! : (siblings.at(-1) ?? rows[kind].at(-1)!));
    rows[kind].splice(anchor + 1, 0, row);
    return row;
  };
  const remove = (kind: ApiKind, row: Row): Array<{ kind: ApiKind; id: string }> => {
    const gone: Array<{ kind: ApiKind; id: string }> = [];
    for (const child of CHILDREN[kind])
      for (const sub of rows[child].filter((other) => other[PARENT[child]![0]] === row.id)) gone.push(...remove(child, sub));
    rows[kind] = rows[kind].filter((other) => other !== row);
    log(kind, row.id, 'delete', row, null);
    return [...gone, { kind, id: row.id }];
  };
  const rejected = (path: string) => {
    if (!state.rejection?.match.test(path)) return undefined;
    const { issues } = state.rejection;
    state.rejection = undefined;
    return failure(422, 'invalid_content', { issues });
  };

  const handle = async (method: string, path: string, body: Record<string, unknown>): Promise<Response> => {
    if (method === 'GET' && path === '/draft') return json(snapshot());
    if (method === 'GET' && path.startsWith('/draft/changes')) {
      const since = Number(new URL(path, 'http://x').searchParams.get('since'));
      return json({ changes: changes.filter((c) => (c.changeId as number) > since), latestChangeId: changes.length, hasMore: false });
    }
    if (method === 'GET' && path === '/draft/diff') {
      const status = { create: 'added', update: 'changed', move: 'moved', delete: 'removed' } as Record<string, string>;
      const content = (row: unknown) => (row ? { ...(row as Row), version: undefined } : null);
      const entries = changes.slice(state.published).map((change) => ({
        kind: change.kind,
        id: change.entityId,
        status: status[change.action as string],
        before: content(change.before),
        after: content(change.after),
      }));
      return json({ entries, totals: {}, truncated: false });
    }
    if (method === 'GET' && path.startsWith('/releases'))
      return json({
        releases: [{ releaseId: 'release-1', quizRevision: 'q', flashcardRevision: 'f', createdAt: '2026-01-01T00:00:00Z', latestPublicationSequence: 1, active: true }],
        nextCursor: null,
      });
    if (method === 'POST' && path === '/draft/discard') {
      load();
      state.changed = false;
      return json(snapshot());
    }
    if (method === 'POST' && path === '/draft/publish') {
      if (!state.changed) return json({ published: false, releaseId: 'release-1', publicationSequence: state.publications });
      state.changed = false;
      state.published = changes.length;
      return json({ published: true, releaseId: 'release-2', publicationSequence: ++state.publications });
    }
    let match = path.match(/^\/draft\/changes\/(\d+)\/revert$/);
    if (method === 'POST' && match) {
      const change = changes[Number(match[1]) - 1] as { kind: ApiKind; entityId: string; action: string; before: Row | null };
      const kind = change.kind;
      const current = find(kind, change.entityId);
      if (change.action === 'create' && current) {
        remove(kind, current);
        return json({ kind, id: change.entityId, record: null, changeId: changes.length });
      }
      if (change.action === 'delete' && change.before) {
        const restored = { ...change.before, version: change.before.version + 1 };
        rows[kind].push(restored);
        return json({ kind, id: change.entityId, record: restored, changeId: log(kind, restored.id, 'create', null, restored) });
      }
      if (!current || !change.before) return failure(404, 'record_not_found');
      const reverted = { ...change.before, version: current.version + 1 };
      rows[kind][rows[kind].indexOf(current)] = reverted;
      return json({ kind, id: change.entityId, record: reverted, changeId: log(kind, reverted.id, 'update', current, reverted) });
    }
    match = path.match(/^\/releases\/([^/]+)\/activate$/);
    if (method === 'POST' && match) {
      return body.expectedPublicationSequence !== state.publications
        ? failure(409, 'publication_stale')
        : json({ releaseId: match[1], publicationSequence: state.publications });
    }
    match = path.match(/^\/draft\/(quizzes|decks)\/([^/]+)\/(questions|cards)\/bulk$/);
    if (method === 'POST' && match) {
      const child = match[3] as ApiKind;
      const parent = find(match[1] as ApiKind, decodeURIComponent(match[2]));
      if (!parent) return failure(404, 'record_not_found');
      const refusal = rejected(path);
      if (refusal) return refusal;
      const created = (body.records as object[]).map((fields) => insert(child, parent.id, undefined, fields));
      const ids = created.map((row) => log(child, row.id, 'create', null, row));
      return json({ records: created, changeIds: ids }, 201);
    }
    match = path.match(/^\/draft\/(\w+)(?:\/([^/]+)(\/move)?)?$/);
    if (!match || !KINDS.includes(match[1] as ApiKind)) throw new Error(`Unexpected admin request ${method} ${path}`);
    const kind = match[1] as ApiKind;
    const id = match[2] && decodeURIComponent(match[2]);
    if (method === 'POST' && !id) {
      const parentKey = PARENT[kind];
      if (parentKey && !find(parentKey[1], body.parentId as string)) return failure(422, 'parent_not_found');
      const refusal = rejected(path);
      if (refusal) return refusal;
      const row = insert(kind, body.parentId as string | undefined, body.afterId as string | null | undefined, body.fields as object);
      return json({ record: row, changeId: log(kind, row.id, 'create', null, row) }, 201);
    }
    const row = id ? find(kind, id) : undefined;
    if (!row) return failure(404, 'record_not_found');
    if (row.version !== body.expectedVersion) return failure(409, 'version_conflict', { current: row });
    if (method === 'PUT') {
      const refusal = rejected(path);
      if (refusal) return refusal;
      const next: Row = { ...row, version: row.version + 1 };
      for (const [key, value] of Object.entries(body.fields as object)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      if (JSON.stringify({ ...next, version: 0 }) === JSON.stringify({ ...row, version: 0 })) return json({ record: row, changeId: null });
      rows[kind][rows[kind].indexOf(row)] = next;
      return json({ record: next, changeId: log(kind, row.id, 'update', row, next) });
    }
    if (method === 'DELETE') {
      const hasChildren = CHILDREN[kind].some((child) => rows[child].some((other) => other[PARENT[child]![0]] === row.id));
      if (hasChildren && !body.cascade) return failure(409, 'has_children', { children: {} });
      const deleted = remove(kind, row);
      return json({ deleted, changeIds: [] });
    }
    // move
    const parent = PARENT[kind];
    const moved: Row = { ...row, ...(parent && body.parentId ? { [parent[0]]: body.parentId } : {}), version: row.version + 1 };
    rows[kind] = rows[kind].filter((other) => other !== row);
    const siblings = rows[kind].filter((other) => !parent || other[parent[0]] === moved[parent[0]]);
    const anchor = body.afterId === null ? -1 : rows[kind].indexOf(body.afterId ? find(kind, body.afterId as string)! : (siblings.at(-1) ?? rows[kind].at(-1)!));
    rows[kind].splice(anchor + 1, 0, moved);
    return json({ record: moved, changeId: log(kind, row.id, 'move', row, moved) });
  };

  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input).replace('/api/admin', '');
    if (hold?.match.test(path)) await hold.gate;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return handle(init?.method ?? 'GET', path, body);
  });
  const client = new PairedHttpClient(fetcher);
  client.session = { authenticated: true, csrfToken: 'csrf', fresh: true };
  const store = new DraftStore(client, snapshot());
  return Object.assign(store, {
    fetcher,
    /** Records as the fake server holds them, independent of the store's local copy. */
    serverRows: () => rows,
    /** The server's snapshot as `GET /draft` would return it right now. */
    serverSnapshot: snapshot,
    /** Change a record behind the editor's back, as another editor would. */
    editElsewhere(kind: ApiKind, id: string, fields: object) {
      const row = find(kind, id)!;
      const next = { ...row, ...fields, version: row.version + 1 };
      rows[kind][rows[kind].indexOf(row)] = next;
      log(kind, id, 'update', row, next);
    },
    /** The next create or update whose path matches is refused as invalid content, with these issues. */
    rejectNext(issues: Array<{ path: string; code: string; message: string }>, match = /./) {
      state.rejection = { issues, match };
    },
    /** Delay the response to matching requests until the returned function is called. */
    holdRequests(match: RegExp) {
      let release!: () => void;
      hold = { match, gate: new Promise<void>((resolve) => (release = resolve)) };
      return () => {
        release();
        hold = undefined;
      };
    },
    changeLog: changes,
  });
}
