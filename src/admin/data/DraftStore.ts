import type {
  StoredFlashcard,
  StoredFlashcardDeck,
  StoredQuestion,
  StoredQuiz,
  StoredSubject,
  StoredTopic,
} from '../../content/schema/schema';
import type { RecordKind } from '../core/recordDraft';
import { AdminHttpError, errorMessages, PairedHttpClient } from './PairedHttpClient';

export type Versioned<T> = T & { version: number };
export type ApiKind = 'subjects' | 'topics' | 'quizzes' | 'questions' | 'decks' | 'cards';
export const API_KIND: Record<RecordKind, ApiKind> = {
  subject: 'subjects',
  topic: 'topics',
  quiz: 'quizzes',
  question: 'questions',
  deck: 'decks',
  card: 'cards',
};
export const RECORD_KIND = Object.fromEntries(Object.entries(API_KIND).map(([kind, api]) => [api, kind])) as Record<
  ApiKind,
  RecordKind
>;
export type StoredRecord = Versioned<
  StoredSubject | StoredTopic | StoredQuiz | StoredQuestion | StoredFlashcardDeck | StoredFlashcard
>;
export type Fields = Record<string, unknown>;

export interface DraftQuizBank {
  schemaVersion: 6;
  subjects: Versioned<StoredSubject>[];
  topics: Versioned<StoredTopic>[];
  quizzes: Versioned<StoredQuiz>[];
  questions: Versioned<StoredQuestion>[];
}
export interface DraftFlashcardBank {
  schemaVersion: 4;
  decks: Versioned<StoredFlashcardDeck>[];
  cards: Versioned<StoredFlashcard>[];
}
export interface DraftSnapshot {
  subjects: Versioned<StoredSubject>[];
  topics: Versioned<StoredTopic>[];
  quizzes: Versioned<StoredQuiz>[];
  questions: Versioned<StoredQuestion>[];
  decks: Versioned<StoredFlashcardDeck>[];
  cards: Versioned<StoredFlashcard>[];
  changed: boolean;
  latestChangeId: number;
  publishedChangeId: number | null;
  baseReleaseId: string | null;
  activeReleaseId: string | null;
  publicationSequence: number;
}
export interface DraftChange {
  changeId: number;
  createdAt: string;
  actor: string;
  kind: ApiKind;
  entityId: string;
  action: 'create' | 'update' | 'move' | 'delete';
  before: Fields | null;
  after: Fields | null;
}
export type DiffStatus = 'added' | 'changed' | 'moved' | 'removed';
/** Records that differ between the published version and the draft; `entries` is capped, `totals` is not. */
export interface DraftDiff {
  entries: { kind: ApiKind; id: string; status: DiffStatus; before: Fields | null; after: Fields | null }[];
  totals: Partial<Record<ApiKind, Partial<Record<DiffStatus, number>>>>;
  truncated: boolean;
}
export interface ReleaseSummary {
  releaseId: string;
  quizRevision: string;
  flashcardRevision: string;
  createdAt: string;
  latestPublicationSequence: number | null;
  active: boolean;
}
export type PublishResult =
  | { published: true; releaseId: string; publicationSequence: number }
  | { published: false; releaseId: string | null; publicationSequence: number };

/** One new quiz or deck (or an existing one) and the questions or cards to add under it. */
export interface BulkGroup {
  parentId?: string;
  create?: { kind: 'quizzes' | 'decks'; fields: Fields };
  childKind: 'questions' | 'cards';
  children: Fields[];
}
/** A new topic (`fields`) or an existing one (`id`), and the groups to add under it. Groups with `parentId` need neither. */
export interface BulkTopic {
  id?: string;
  fields?: Fields;
  groups: BulkGroup[];
}
/** New topics are created under `subjectId` in order, each followed by its groups. */
export interface BulkPlan {
  subjectId?: string;
  topics: BulkTopic[];
}
export interface BulkResult {
  topicIds: string[];
  parentIds: string[];
  created: number;
}
/** A bulk add that stopped part-way: what was saved before the failing step is kept in the draft. */
export class BulkFailure extends Error {
  constructor(
    readonly cause: unknown,
    readonly step: string,
    readonly saved: string,
  ) {
    super([`Failed while ${step}.`, saved, ...errorMessages(cause)].filter(Boolean).join(' '));
  }
}

const COLLECTIONS: ApiKind[] = ['subjects', 'topics', 'quizzes', 'questions', 'decks', 'cards'];
const sameId = (id: string) => (row: { id: string }) => row.id === id;

/**
 * The loaded draft plus every record call. The server owns IDs, versions, validation and history; each write
 * replaces or refetches the local copy from the response, so nothing is ever reconstructed on the client.
 */
export class DraftStore {
  snapshot: DraftSnapshot;
  quizBank!: DraftQuizBank;
  flashcardBank!: DraftFlashcardBank;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly client: PairedHttpClient,
    snapshot: DraftSnapshot,
  ) {
    this.snapshot = snapshot;
    this.derive();
  }
  static async open(client: PairedHttpClient): Promise<DraftStore> {
    return new DraftStore(client, await client.get<DraftSnapshot>('/draft'));
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private derive(): void {
    const { subjects, topics, quizzes, questions, decks, cards } = this.snapshot;
    this.quizBank = { schemaVersion: 6, subjects, topics, quizzes, questions };
    this.flashcardBank = { schemaVersion: 4, decks, cards };
  }
  private install(snapshot: DraftSnapshot): void {
    this.snapshot = snapshot;
    this.derive();
    for (const listener of this.listeners) listener();
  }
  find(kind: RecordKind, id: string): StoredRecord | undefined {
    return (this.snapshot[API_KIND[kind]] as StoredRecord[]).find(sameId(id));
  }
  /** Replace one record locally with a version the server just returned. */
  private replace(kind: ApiKind, record: StoredRecord, changed = true): void {
    const rows = (this.snapshot[kind] as StoredRecord[]).map((row) => (row.id === record.id ? record : row));
    this.install({ ...this.snapshot, [kind]: rows, changed: this.snapshot.changed || changed });
  }
  async refresh(): Promise<void> {
    this.install(await this.client.get<DraftSnapshot>('/draft'));
  }
  /** Run one write command, then reload so order, parents and flags always match the server. */
  private async write<T>(action: () => Promise<T>, reload = true): Promise<T> {
    return this.client.runCommand(async () => {
      try {
        return await action();
      } finally {
        if (reload) await this.refresh().catch(() => undefined);
      }
    });
  }

  async create(kind: RecordKind, parentId: string | undefined, fields: Fields, afterId?: string | null) {
    return this.write(async () => {
      const result = await this.client.post<{ record: StoredRecord; changeId: number }>(`/draft/${API_KIND[kind]}`, {
        ...(parentId ? { parentId } : {}),
        ...(afterId !== undefined ? { afterId } : {}),
        fields,
      });
      return result.record;
    });
  }
  /** A top-level merge patch (`null` removes an optional field) against the version the editor loaded. */
  async update(kind: RecordKind, id: string, expectedVersion: number, fields: Fields): Promise<StoredRecord> {
    return this.write(async () => {
      try {
        const result = await this.client.put<{ record: StoredRecord; changeId: number | null }>(
          `/draft/${API_KIND[kind]}/${encodeURIComponent(id)}`,
          { expectedVersion, fields },
        );
        this.replace(API_KIND[kind], result.record, result.changeId !== null);
        return result.record;
      } catch (error) {
        if (error instanceof AdminHttpError && error.code === 'version_conflict' && error.body.current)
          this.replace(API_KIND[kind], error.body.current as StoredRecord, false);
        throw error;
      }
    }, false);
  }
  async move(
    kind: RecordKind,
    id: string,
    expectedVersion: number,
    place: { parentId?: string; afterId?: string | null },
  ): Promise<StoredRecord> {
    return this.write(async () => {
      const result = await this.client.post<{ record: StoredRecord }>(
        `/draft/${API_KIND[kind]}/${encodeURIComponent(id)}/move`,
        { expectedVersion, ...place },
      );
      return result.record;
    });
  }
  /** Delete the given records (and, with `cascade`, everything under them) from the draft. */
  async remove(kind: RecordKind, records: readonly { id: string; version: number }[], cascade = true) {
    return this.write(async () => {
      for (const record of records)
        await this.client.delete(`/draft/${API_KIND[kind]}/${encodeURIComponent(record.id)}`, {
          expectedVersion: record.version,
          cascade,
        });
    });
  }
  /** Add children in bulk, creating new topics and quiz/deck parents first when the plan asks for them. */
  async addTree(plan: BulkPlan): Promise<BulkResult> {
    return this.write(async () => {
      const result: BulkResult = { topicIds: [], parentIds: [], created: 0 };
      let step = 'starting';
      const saved = () =>
        result.created || result.topicIds.length || result.parentIds.length
          ? `Already saved to the draft: ${[
              result.topicIds.length ? `topics ${result.topicIds.join(', ')}` : '',
              result.parentIds.length ? `parents ${result.parentIds.join(', ')}` : '',
              result.created ? `${result.created} record(s) in bulk` : '',
            ]
              .filter(Boolean)
              .join('; ')}.`
          : '';
      try {
        for (const topic of plan.topics) {
          let topicId = topic.id;
          if (topic.fields) {
            step = 'creating a topic';
            topicId = (
              await this.client.post<{ record: { id: string } }>('/draft/topics', {
                parentId: plan.subjectId,
                fields: topic.fields,
              })
            ).record.id;
            result.topicIds.push(topicId);
          }
          for (const group of topic.groups) {
            let parentId = group.parentId;
            if (group.create) {
              step = `creating ${group.create.kind === 'quizzes' ? 'a quiz' : 'a deck'}`;
              parentId = (
                await this.client.post<{ record: { id: string } }>(`/draft/${group.create.kind}`, {
                  parentId: topicId,
                  fields: group.create.fields,
                })
              ).record.id;
              result.parentIds.push(parentId);
            }
            if (parentId && group.children.length) {
              step = `adding ${group.childKind} to ${parentId}`;
              const parent = group.childKind === 'questions' ? 'quizzes' : 'decks';
              await this.client.post(`/draft/${parent}/${encodeURIComponent(parentId)}/${group.childKind}/bulk`, {
                records: group.children,
              });
              result.created += group.children.length;
            }
          }
        }
        return result;
      } catch (error) {
        throw new BulkFailure(error, step, saved());
      }
    });
  }

  changes(since = 0, limit = 500) {
    return this.client.get<{ changes: DraftChange[]; latestChangeId: number; hasMore: boolean }>(
      `/draft/changes?since=${since}&limit=${limit}`,
    );
  }
  diff() {
    return this.client.get<DraftDiff>('/draft/diff');
  }
  /** Revert one change; `expectedVersion` is the record's current version when it still exists. */
  async revert(change: DraftChange): Promise<void> {
    const current = this.find(RECORD_KIND[change.kind], change.entityId);
    await this.write(async () => {
      await this.client.post(`/draft/changes/${change.changeId}/revert`, current ? { expectedVersion: current.version } : {});
    });
  }
  async discard(): Promise<void> {
    await this.client.runCommand(async () => {
      this.install(await this.client.post<DraftSnapshot>('/draft/discard', {}));
    });
  }
  async publish(): Promise<PublishResult> {
    return this.write(() => this.client.post<PublishResult>('/draft/publish', {}));
  }
  async releases(cursor?: string) {
    return this.client.get<{ releases: ReleaseSummary[]; nextCursor: string | null }>(
      '/releases' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
    );
  }
  async activate(releaseId: string): Promise<void> {
    await this.write(async () => {
      await this.client.post(`/releases/${releaseId}/activate`, {
        expectedPublicationSequence: this.snapshot.publicationSequence,
      });
    });
  }
}

export const counts = (snapshot: DraftSnapshot) =>
  Object.fromEntries(COLLECTIONS.map((kind) => [kind, snapshot[kind].length])) as Record<ApiKind, number>;
