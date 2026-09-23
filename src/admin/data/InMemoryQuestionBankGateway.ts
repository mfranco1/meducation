import type { StoredQuestionBank } from '../../content/schema';
import { previewChangeSet } from '../core/applyChangeSet';
import { cloneBank, revisionForBank } from '../core/serializeBank';
import type { AdminBankSnapshot, AdminChangePreview, AdminChangeSet } from '../core/types';
import type { AdminQuestionBankGateway } from './AdminQuestionBankGateway';

export class InMemoryQuestionBankGateway implements AdminQuestionBankGateway {
  private readonly initial: StoredQuestionBank;
  private bank: StoredQuestionBank;
  private history: StoredQuestionBank[] = [];
  private operationLengths: number[] = [];
  private operations: AdminChangeSet['operations'] = [];

  constructor(bank: StoredQuestionBank) {
    this.initial = cloneBank(bank);
    this.bank = cloneBank(bank);
  }

  private async snapshot(): Promise<AdminBankSnapshot> {
    return { bank: cloneBank(this.bank), revision: await revisionForBank(this.bank) };
  }

  load(): Promise<AdminBankSnapshot> { return this.snapshot(); }

  async preview(changeSet: AdminChangeSet): Promise<AdminChangePreview> {
    const current = await revisionForBank(this.bank);
    if (changeSet.base.revision !== current) return {
      bank: cloneBank(this.bank),
      issues: [{ level: 'error', message: 'This change set was created from a stale snapshot. Reload or rebuild it before applying.' }],
      summary: { creates: 0, updates: 0, deletes: 0, moves: 0, cascadedQuestions: 0, cascadedQuizzes: 0 },
    };
    return previewChangeSet(this.bank, changeSet);
  }

  async apply(changeSet: AdminChangeSet): Promise<AdminBankSnapshot> {
    const preview = await this.preview(changeSet);
    if (preview.issues.some(issue => issue.level === 'error')) throw new Error(preview.issues.map(issue => issue.message).join(' '));
    this.history.push(cloneBank(this.bank));
    this.operationLengths.push(this.operations.length);
    this.bank = cloneBank(preview.bank);
    this.operations.push(...changeSet.operations);
    return this.snapshot();
  }

  async undo(): Promise<AdminBankSnapshot | undefined> {
    const previous = this.history.pop();
    if (!previous) return undefined;
    this.bank = previous;
    this.operations = this.operations.slice(0, this.operationLengths.pop() ?? 0);
    return this.snapshot();
  }

  async reset(): Promise<AdminBankSnapshot> {
    this.bank = cloneBank(this.initial);
    this.history = [];
    this.operationLengths = [];
    this.operations = [];
    return this.snapshot();
  }

  appliedOperations(): AdminChangeSet['operations'] { return [...this.operations]; }
}
