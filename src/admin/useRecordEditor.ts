import { useEffect, useRef, useState } from 'react';
import {
  adoptServerId,
  newRecordTemplate,
  PARENT_KEY,
  planSave,
  toRecordText,
  type DraftRecord,
  type RecordKind,
} from './core/recordDraft';
import { AdminHttpError, errorMessages } from './data/PairedHttpClient';
import type { DraftStore, StoredRecord } from './data/DraftStore';
import { useAdminConfirmation } from './useAdminConfirmation';

export type Selection = { kind: RecordKind; id?: string; parentId?: string };
interface Loaded {
  text: string;
  record?: StoredRecord;
  version?: number;
}
const none: Loaded = { text: '' };

/**
 * One editable JSON record at a time, for every record kind. The text is the author's; Save sends one create or
 * patch and the returned record replaces the local copy. A version conflict keeps the text and shows the server's copy.
 */
export function useRecordEditor(
  store: DraftStore,
  options: {
    blocked?: boolean;
    draftLabel?: string;
    initial?: Selection;
    /** Where selection goes when the selected record disappears (deleted or reverted elsewhere). */
    fallback?: (selection: Selection) => Selection | undefined;
  } = {},
) {
  const [selection, setSelection] = useState<Selection | undefined>(options.initial);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState<Loaded>(none);
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<StoredRecord>();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const busyRef = useRef(false);
  const editVersion = useRef(0);
  const dirty = text !== loaded.text;
  const confirmation = useAdminConfirmation([text, options.blocked]);
  const unavailable = () => busyRef.current || Boolean(options.blocked);
  const discardDraft = () =>
    confirmation.request(`Discard the unsaved ${options.draftLabel ?? 'record'} text to continue?`);

  useEffect(() => store.subscribe(() => setTick((value) => value + 1)), [store]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', beforeUnload);
    return () => removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const reset = (next: Selection | undefined, value: Loaded) => {
    editVersion.current += 1;
    setSelection(next);
    setLoaded(value);
    setText(value.text);
    setIssues([]);
    setNotice('');
    setConflict(undefined);
  };
  // The local copy follows the server: a vanished record leaves the selection, and a changed one reloads unless
  // the author has unsaved text, in which case Save reports the conflict instead of overwriting.
  useEffect(() => {
    if (!selection?.id || busyRef.current) return;
    const record = store.find(selection.kind, selection.id);
    if (!record) {
      if (!dirty) reset(options.fallback?.(selection), none);
    } else if (!dirty && !conflict && loaded.record && loaded.version !== record.version)
      reset(selection, { text: toRecordText(record), record, version: record.version });
  });

  /** Change what is selected without opening a record's text. */
  const select = async (next: Selection | undefined) => {
    if (unavailable() || (dirty && !(await discardDraft()))) return false;
    reset(next, none);
    return true;
  };
  const load = async (next: Selection, record: StoredRecord) => {
    if (unavailable()) return false;
    if (next.id && next.kind === selection?.kind && next.id === selection.id && loaded.record?.id === next.id)
      return true;
    if (dirty && !(await discardDraft())) return false;
    reset(next, { text: toRecordText(record), record, version: record.version });
    return true;
  };
  const loadNew = async (kind: RecordKind, parentId?: string) => {
    if (unavailable() || (dirty && !(await discardDraft()))) return false;
    // A new record has no stored baseline, so Save creates it.
    reset({ kind, parentId }, { text: JSON.stringify(newRecordTemplate(kind, parentId), null, 2) });
    return true;
  };
  const edit = (value: string) => {
    editVersion.current += 1;
    setText(value);
    setNotice('');
  };

  const save = async (): Promise<boolean> => {
    if (unavailable() || !selection) return false;
    const kind = selection.kind;
    const plan = planSave(kind, text, loaded.record as DraftRecord | undefined);
    if ('error' in plan) {
      setIssues([plan.error]);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setIssues([]);
    setNotice('');
    setConflict(undefined);
    const version = editVersion.current;
    let record = loaded.record;
    let expected = loaded.version;
    try {
      if (!record) record = await store.create(kind, plan.parentId, plan.fields);
      else {
        if (plan.moveTo) {
          record = await store.move(kind, record.id, expected!, { parentId: plan.moveTo });
          expected = record.version;
          const moved = record;
          setLoaded((previous) => ({ ...previous, record: moved, version: moved.version }));
        }
        if (Object.keys(plan.fields).length) record = await store.update(kind, record.id, expected!, plan.fields);
      }
      const saved = record;
      const savedText = toRecordText(saved);
      const parentKey = PARENT_KEY[kind];
      setLoaded({ text: savedText, record: saved, version: saved.version });
      setSelection({
        kind,
        id: saved.id,
        parentId: parentKey ? String((saved as unknown as DraftRecord)[parentKey]) : undefined,
      });
      // Text typed while the save was in flight is newer than the saved record and stays unsaved.
      if (editVersion.current === version) setText(savedText);
      else setText((latest) => adoptServerId(latest, saved.id));
      setNotice('Saved to the draft. Saving does not publish.');
      return true;
    } catch (error) {
      if (error instanceof AdminHttpError && error.code === 'version_conflict' && error.body.current)
        setConflict(error.body.current as StoredRecord);
      else setIssues(errorMessages(error));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  /** Take the server's current record in place of the unsaved text. */
  const takeServerVersion = () => {
    if (conflict) reset(selection, { text: toRecordText(conflict), record: conflict, version: conflict.version });
  };
  /** Keep the author's changes and save them on top of the server's current version. */
  const keepMine = () => {
    if (!conflict) return;
    setLoaded((previous) => ({ ...previous, version: conflict.version }));
    setConflict(undefined);
  };

  return {
    selection,
    text,
    dirty,
    /** A record, new or existing, is open in the editor. */
    open: text !== '' || loaded.text !== '',
    issues,
    notice,
    conflict,
    busy,
    discardDialog: confirmation.dialog,
    discardDraft,
    select,
    load,
    loadNew,
    edit,
    save,
    takeServerVersion,
    keepMine,
  };
}
