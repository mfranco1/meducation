import { useEffect, useState } from 'react';
import type { StoredQuestionBank } from '../content/schema';
import type { ValidationIssue } from '../content/validate';
import type { AdminChangeSet } from './core/types';
import type { AdminQuestionBankGateway } from './data/AdminQuestionBankGateway';

export type EntityKind = 'subject' | 'quiz' | 'question';
export type Selection = { kind: EntityKind; id?: string; parentId?: string };
export type EditorMode = 'single' | 'bulk';
export interface PendingBulk {
  changeSet: AdminChangeSet;
  questionPaths: Record<string, string>;
  generatedIds: string[];
}
export interface ImportedChangeSet {
  text: string;
  changeSet: AdminChangeSet;
  issues: ValidationIssue[];
}

/** Owns the mutable state shared by all admin editing workflows. */
export function useAdminEditor(gateway: AdminQuestionBankGateway) {
  const [snapshot, setSnapshot] = useState<{ bank: StoredQuestionBank; revision: string }>();
  const [originalRevision, setOriginalRevision] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'subject' });
  const [mode, setMode] = useState<EditorMode>('single');
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('Local question-bank edit');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [summary, setSummary] = useState('Load a record or paste a change set.');
  const [dirty, setDirty] = useState(false);
  const [exported, setExported] = useState(false);
  const [filter, setFilter] = useState('');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk>();
  const [importedChangeSet, setImportedChangeSet] = useState<ImportedChangeSet>();

  useEffect(() => {
    gateway.load().then(loaded => {
      setSnapshot(loaded);
      setOriginalRevision(loaded.revision);
    });
  }, [gateway]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  return {
    snapshot, setSnapshot,
    originalRevision,
    selection, setSelection,
    mode, setMode,
    editor, setEditor,
    reason, setReason,
    issues, setIssues,
    summary, setSummary,
    dirty, setDirty,
    exported, setExported,
    filter, setFilter,
    pendingBulk, setPendingBulk,
    importedChangeSet, setImportedChangeSet,
  };
}
