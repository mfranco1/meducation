import { describe, expect, it } from 'vitest';
import { workspaceStatus } from './workspaceStatus';

const clean = { quizzes: false, flashcards: false };
const draft = (changed: boolean, base: string | null = 'r1', active: string | null = 'r1') => ({ changed, baseReleaseId: base, activeReleaseId: active });
describe('workspace status', () => {
  it('distinguishes unsaved text and unpublished draft changes independently', () => {
    expect(workspaceStatus(draft(false), clean)).toMatchObject({ label: 'Up to date', draftChanged: false });
    expect(workspaceStatus(draft(true), clean)).toMatchObject({ label: 'Draft changes', publishBlocked: '' });
    expect(workspaceStatus(draft(true), { quizzes: false, flashcards: true })).toMatchObject({ label: 'Unsaved edits', draftChanged: true });
    expect(workspaceStatus(draft(true), { quizzes: true, flashcards: true }).publishBlocked).toContain('Quizzes and Flashcards');
  });
  it('blocks publication of an unchanged draft and flags a draft based on another release', () => {
    expect(workspaceStatus(draft(false), clean).publishBlocked).toContain('no draft changes');
    expect(workspaceStatus(draft(true, 'r1', 'r2'), clean)).toMatchObject({ staleBase: true, publishBlocked: '' });
    expect(workspaceStatus(draft(true, null, null), clean).staleBase).toBe(false);
    expect(workspaceStatus(draft(true, null, 'r1'), clean).staleBase).toBe(false);
  });
});
