import { contentRetryPolicy, type RetryPolicy } from './retryPolicy';
import { ContentLoadError, genericFailure, revisionError, type JsonTransport, browserJsonTransport } from './contentTransport';
import { isFlashcardCatalog, isFlashcardList, isFlashcardSubjectResponse, type FlashcardCatalogResponse, type FlashcardDeckSummary, type FlashcardSubjectSummary } from './flashcardApiDecoders';
import type { StoredFlashcard, StoredFlashcardTopic } from './schema';

type ResourceState = 'idle' | 'loading' | 'ready' | 'error';

export class RuntimeFlashcardBank {
  private revision = '';
  private source: 'api' | 'local' = 'api';
  private subjects: FlashcardSubjectSummary[] = [];
  private readonly catalogs = new Map<string, FlashcardCatalogResponse>();
  private readonly cards = new Map<string, StoredFlashcard[]>();
  private readonly states = new Map<string, ResourceState>();
  private readonly errors = new Map<string, Error>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private version = 0;

  constructor(private readonly retryPolicy: RetryPolicy = contentRetryPolicy, private readonly transport: JsonTransport = browserJsonTransport) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.version;
  private notify() { this.version += 1; this.listeners.forEach(listener => listener()); }
  getState(key: string): ResourceState { return this.states.get(key) ?? 'idle'; }
  getError(key: string) { return this.errors.get(key); }
  cancel(key: string) {
    this.controllers.get(key)?.abort();
    this.controllers.delete(key);
    this.pending.delete(key);
    if (this.states.get(key) === 'loading') this.states.set(key, 'idle');
    this.notify();
  }
  cancelAll() { [...this.controllers.keys()].forEach(key => this.cancel(key)); }
  listSubjects() { return this.subjects; }
  getSubjectCatalog(subjectId: string) { return this.catalogs.get(subjectId); }
  listTopics(subjectId: string): StoredFlashcardTopic[] { return this.catalogs.get(subjectId)?.topics ?? []; }
  listDecks(subjectId: string): FlashcardDeckSummary[] { return this.catalogs.get(subjectId)?.decks ?? []; }
  listCards(deckId: string) { return this.cards.get(deckId) ?? []; }
  getDeck(deckId: string) { return [...this.catalogs.values()].flatMap(catalog => catalog.decks).find(deck => deck.id === deckId); }

  configureLocal(subjects: FlashcardSubjectSummary[], topics: StoredFlashcardTopic[], decks: FlashcardDeckSummary[], cards: StoredFlashcard[]) {
    this.generation += 1;
    this.source = 'local';
    this.subjects = subjects;
    this.cancelAll(); this.catalogs.clear(); this.cards.clear(); this.pending.clear(); this.states.clear(); this.errors.clear();
    for (const subject of subjects) {
      const subjectTopics = topics.filter(topic => topic.subjectId === subject.id);
      const topicIds = new Set(subjectTopics.map(topic => topic.id));
      const subjectDecks = decks.filter(deck => topicIds.has(deck.topicId));
      this.catalogs.set(subject.id, { revision: 'local', topics: subjectTopics.map(topic => ({ ...topic, deckCount: subjectDecks.filter(deck => deck.topicId === topic.id).length })), decks: subjectDecks });
      this.states.set(`catalog:${subject.id}`, 'ready');
    }
    this.states.set('subjects', 'ready');
    for (const deck of decks) this.cards.set(deck.id, cards.filter(card => card.deckId === deck.id));
    this.notify();
  }

  async ensureSubjects(): Promise<FlashcardSubjectSummary[]> {
    if (this.getState('subjects') === 'ready' || this.source === 'local') return this.subjects;
    const existing = this.pending.get('subjects') as Promise<FlashcardSubjectSummary[]> | undefined;
    if (existing) return existing;
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.set('subjects', controller);
    this.states.set('subjects', 'loading'); this.errors.delete('subjects'); this.notify();
    const request = this.transport.get<unknown>('/api/v1/flashcards/subjects', { policy: this.retryPolicy, signal: controller.signal }).then(payload => {
      if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
      if (!isFlashcardSubjectResponse(payload)) throw new ContentLoadError('invalid', 'The flashcard catalog is incomplete. Retry later.');
      this.revision = payload.revision; this.subjects = payload.subjects; this.states.set('subjects', 'ready'); this.notify(); return this.subjects;
    }).catch(error => { if (generation === this.generation && !(error instanceof ContentLoadError && error.kind === 'cancelled')) { this.states.set('subjects', 'error'); this.errors.set('subjects', error instanceof Error ? error : new Error('Could not load flashcard subjects.')); this.notify(); } throw error; }).finally(() => { if (this.pending.get('subjects') === request) { this.pending.delete('subjects'); this.controllers.delete('subjects'); } });
    this.pending.set('subjects', request); return request;
  }

  async ensureSubjectCatalog(subjectId: string): Promise<FlashcardCatalogResponse> {
    const cached = this.catalogs.get(subjectId);
    if (cached) return cached;
    if (this.source === 'local') return { revision: 'local', topics: [], decks: [] };
    const key = `catalog:${subjectId}`;
    const existing = this.pending.get(key) as Promise<FlashcardCatalogResponse> | undefined;
    if (existing) return existing;
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.states.set(key, 'loading'); this.errors.delete(key); this.notify();
    const request = this.transport.get<unknown>(`/api/v1/flashcards/subjects/${encodeURIComponent(subjectId)}/catalog?revision=${encodeURIComponent(this.revision)}`, { policy: this.retryPolicy, signal: controller.signal })
      .then(payload => {
        if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
        const subject = this.subjects.find(item => item.id === subjectId);
        if (!subject || !isFlashcardCatalog(payload, subjectId, subject.topicCount, subject.deckCount)) throw new ContentLoadError('invalid', 'The flashcard topic catalog is incomplete. Retry later.');
        if (payload.revision !== this.revision) throw revisionError();
        this.catalogs.set(subjectId, payload); this.states.set(key, 'ready'); this.notify(); return payload;
      }).catch(error => { if (generation === this.generation && !(error instanceof ContentLoadError && error.kind === 'cancelled')) { this.states.set(key, 'error'); this.errors.set(key, error instanceof Error ? error : new Error('Could not load flashcard topics.')); this.notify(); } throw error; })
      .finally(() => { if (this.pending.get(key) === request) { this.pending.delete(key); this.controllers.delete(key); } });
    this.pending.set(key, request); return request;
  }

  async ensureCards(deckId: string): Promise<StoredFlashcard[]> {
    const cached = this.cards.get(deckId);
    if (cached) return cached;
    if (this.source === 'local') return [];
    const key = `cards:${deckId}`;
    const existing = this.pending.get(key) as Promise<StoredFlashcard[]> | undefined;
    if (existing) return existing;
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.states.set(key, 'loading'); this.errors.delete(key); this.notify();
    const request = this.transport.get<unknown>(`/api/v1/flashcards/decks/${encodeURIComponent(deckId)}/cards?revision=${encodeURIComponent(this.revision)}`, { policy: this.retryPolicy, signal: controller.signal })
      .then(payload => {
        if (controller.signal.aborted || generation !== this.generation) throw genericFailure('cancelled');
        const deck = this.getDeck(deckId);
        if (controller.signal.aborted || !deck || !isFlashcardList(payload, deckId, deck.cardIds)) throw new ContentLoadError('invalid', 'The flashcard deck is incomplete. Retry later.');
        if (payload.revision !== this.revision) throw revisionError();
        if (payload.cards.length !== deck.cardCount) throw new ContentLoadError('invalid', 'The flashcard deck does not match its catalog. Reload content and retry.');
        this.cards.set(deckId, payload.cards); this.states.set(key, 'ready'); this.notify(); return payload.cards;
      }).catch(error => { if (generation === this.generation && !(error instanceof ContentLoadError && error.kind === 'cancelled')) { this.states.set(key, 'error'); this.errors.set(key, error instanceof Error ? error : new Error('Could not load this deck.')); this.notify(); } throw error; })
      .finally(() => { if (this.pending.get(key) === request) { this.pending.delete(key); this.controllers.delete(key); } });
    this.pending.set(key, request); return request;
  }
}

export const runtimeFlashcardBank = new RuntimeFlashcardBank();

export async function loadRuntimeFlashcardSubjects() {
  if (import.meta.env.VITE_CONTENT_SOURCE === 'local') {
    const local = await import('./flashcardBank');
    const subjects = local.flashcardRepository.listSubjects();
    const topics = local.storedFlashcardBank.topics;
    const decks = local.flashcardRepository.listSubjects().flatMap(subject => local.flashcardRepository.listDecks(subject.id).map(deck => ({ id: deck.id, topicId: deck.topicId, name: deck.name, ...(deck.description ? { description: deck.description } : {}), cardCount: deck.cardCount, cardIds: deck.cardIds })));
    runtimeFlashcardBank.configureLocal(subjects, topics, decks, local.storedFlashcardBank.cards);
    return;
  }
  await runtimeFlashcardBank.ensureSubjects();
}
