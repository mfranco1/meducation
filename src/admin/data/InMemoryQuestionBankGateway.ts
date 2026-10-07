import type { StoredQuestionBank } from '../../content/schema/schema';
import type { StoredFlashcardBank } from '../../content/schema/schema';
import { storedFlashcardBank } from '../../content/local/flashcardBank';
import { previewChangeSet } from '../core/applyChangeSet';
import { validateFlashcardSubjectReferences } from '../../content/validation/validate';
import { validateFlashcardBank } from '../../content/validation/flashcardValidation';
import { cloneBank, revisionForBank } from '../core/serializeBank';
import type { AdminBankSnapshot, AdminChangeSet } from '../core/types';
import type { AdminPreviewSummary, AdminQuestionBankGateway } from './AdminQuestionBankGateway';

const undoLimit = 10;

export class InMemoryQuestionBankGateway implements AdminQuestionBankGateway {
  private readonly initial: StoredQuestionBank;
  private bank: StoredQuestionBank;
  private history: StoredQuestionBank[] = [];
  private operationLengths: number[] = [];
  private operations: AdminChangeSet['operations'] = [];
  private revision?: string;
  private lastPreview?: { key: string; revision: string; bank: StoredQuestionBank; result: AdminPreviewSummary };
  private flashcards: StoredFlashcardBank;

  constructor(bank: StoredQuestionBank, flashcards: StoredFlashcardBank = storedFlashcardBank) {
    this.initial = cloneBank(bank);
    this.bank = cloneBank(bank);
    this.flashcards = structuredClone(flashcards);
  }

  setFlashcardBank(bank: StoredFlashcardBank): void { this.flashcards = structuredClone(bank); this.lastPreview = undefined; }

  private async snapshot(): Promise<AdminBankSnapshot> {
    return { bank: cloneBank(this.bank), revision: await this.currentRevision() };
  }

  private async currentRevision(): Promise<string> {
    return this.revision ??= await revisionForBank(this.bank);
  }

  load(): Promise<AdminBankSnapshot> { return this.snapshot(); }

  async preview(changeSet: AdminChangeSet): Promise<AdminPreviewSummary> {
    const current = await this.currentRevision();
    if (changeSet.base.revision !== current) return {
      issues: [{ level: 'error', message: 'This change set was created from a stale snapshot. Reload or rebuild it before applying.' }],
      summary: { creates: 0, updates: 0, deletes: 0, moves: 0, cascadedQuestions: 0, cascadedQuizzes: 0 },
    };
    const key = JSON.stringify(changeSet);
    if (this.lastPreview?.key === key && this.lastPreview.revision === current) return {
      issues: this.lastPreview.result.issues.map(issue => ({ ...issue })),
      summary: { ...this.lastPreview.result.summary },
    };
    const preview = previewChangeSet(this.bank, changeSet, this.flashcards);
    const result = { issues: preview.issues, summary: preview.summary };
    this.lastPreview = preview.issues.some(issue => issue.level === 'error') ? undefined
      : { key, revision: current, bank: preview.bank, result };
    return { issues: result.issues.map(issue => ({ ...issue })), summary: { ...result.summary } };
  }

  async apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot> {
    const preview = await this.preview(changeSet);
    if (preview.issues.some(issue => issue.level === 'error')) throw new Error(preview.issues.map(issue => issue.message).join(' '));
    const validated = this.lastPreview;
    if (!validated) throw new Error('Validated preview is unavailable.');
    return this.commit(validated.bank, changeSet);
  }

  async applyCoordinated(changeSet: AdminChangeSet, flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot> {
    if (changeSet.base.revision !== await this.currentRevision()) throw new Error('The coordinated import is based on stale quiz content.');
    const preview = previewChangeSet(this.bank, changeSet, flashcards);
    const errors = [...preview.issues, ...validateFlashcardBank(flashcards, preview.bank.subjects)].filter(issue => issue.level === 'error');
    if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '));
    // Both validated snapshots become visible in the same synchronous commit.
    this.flashcards = structuredClone(flashcards);
    return this.commit(preview.bank, changeSet);
  }

  private commit(bank: StoredQuestionBank, changeSet: AdminChangeSet): Promise<AdminBankSnapshot> {
    this.history.push(this.bank);
    this.operationLengths.push(this.operations.length);
    if (this.history.length > undoLimit) { this.history.shift(); this.operationLengths.shift(); }
    this.bank = bank;
    this.operations.push(...changeSet.operations);
    this.revision = undefined;
    this.lastPreview = undefined;
    return this.snapshot();
  }

  async undo(): Promise<AdminBankSnapshot | undefined> {
    const previous = this.history.at(-1);
    if (!previous) return undefined;
    this.assertSharedSubjects(previous);
    this.history.pop();
    this.bank = previous;
    this.operations = this.operations.slice(0, this.operationLengths.pop() ?? 0);
    this.revision = undefined;
    this.lastPreview = undefined;
    return this.snapshot();
  }

  async reset(): Promise<AdminBankSnapshot> {
    this.assertSharedSubjects(this.initial);
    return this.resetToInitial();
  }

  async resetCoordinated(flashcards: StoredFlashcardBank): Promise<AdminBankSnapshot> {
    const errors = validateFlashcardBank(flashcards, this.initial.subjects).filter(issue => issue.level === 'error');
    if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '));
    this.flashcards = structuredClone(flashcards);
    return this.resetToInitial();
  }

  private resetToInitial(): Promise<AdminBankSnapshot> {
    this.bank = cloneBank(this.initial);
    this.history = [];
    this.operationLengths = [];
    this.operations = [];
    this.revision = undefined;
    this.lastPreview = undefined;
    return this.snapshot();
  }

  appliedOperations(): AdminChangeSet['operations'] { return [...this.operations]; }

  private assertSharedSubjects(candidate: StoredQuestionBank) {
    const errors = validateFlashcardSubjectReferences(this.flashcards, candidate.subjects);
    if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '));
  }
}
