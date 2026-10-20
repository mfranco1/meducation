import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { AdminEditorFrame, AdminEditorEmpty, AdminEditorActions } from './components/AdminEditorFrame';
import { AdminNavigatorPanel } from './components/AdminNavigatorPanel';
import { AdminRecordEditor } from './components/AdminRecordEditor';
import { AdminRecordFeedback } from './components/AdminRecordFeedback';
import { AdminRecordMenu } from './components/AdminRecordMenu';
import type { DeleteRequest } from './components/AdminDeleteDialog';
import { reorderTarget } from './core/reorder';
import { errorMessages } from './data/PairedHttpClient';
import type { DraftStore } from './data/DraftStore';
import { QuizBulkAdd, type BulkTarget } from './QuizBulkAdd';
import { useAdminConfirmation } from './useAdminConfirmation';
import { useRecordEditor, type Selection } from './useRecordEditor';

/** Subjects, topics, quizzes and questions: browse, edit one record, add in bulk, reorder, delete. */
export function QuizAdminPanel({
  store,
  blocked = false,
  onDelete,
  onManageSubjects,
  onDirtyChange,
}: {
  store: DraftStore;
  blocked?: boolean;
  onDelete: (request: DeleteRequest) => void;
  onManageSubjects: (id?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const bank = store.quizBank;
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>({ kind: 'subject' });
  const [bulkDirty, setBulkDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const editor = useRecordEditor(store, {
    blocked,
    draftLabel: 'quiz editor',
    initial: { kind: 'subject' },
    fallback: (lost) =>
      lost.kind === 'question'
        ? { kind: 'quiz', id: lost.parentId, parentId: store.quizBank.quizzes.find((quiz) => quiz.id === lost.parentId)?.topicId }
        : lost.kind === 'quiz'
          ? { kind: 'topic', id: lost.parentId, parentId: store.quizBank.topics.find((topic) => topic.id === lost.parentId)?.subjectId }
          : lost.kind === 'topic'
            ? { kind: 'subject', id: lost.parentId }
            : { kind: 'subject' },
  });
  const confirmation = useAdminConfirmation([mode, bulkDirty]);
  const selection: Selection = editor.selection ?? { kind: 'subject' };
  const locked = working || editor.busy || blocked;
  const selectedQuizId =
    selection.kind === 'quiz' ? selection.id : selection.kind === 'question' ? selection.parentId : undefined;
  const selectedQuiz = bank.quizzes.find((quiz) => quiz.id === selectedQuizId);
  const selectedTopicId =
    selection.kind === 'topic'
      ? selection.id
      : selection.kind === 'quiz' && !selection.id
        ? selection.parentId
        : selectedQuiz?.topicId;
  const selectedTopic = bank.topics.find((topic) => topic.id === selectedTopicId);
  const selectedSubject = bank.subjects.find(
    (subject) =>
      subject.id ===
      (selection.kind === 'subject'
        ? selection.id
        : selection.kind === 'topic' && !selection.id
          ? selection.parentId
          : selectedTopic?.subjectId),
  );
  useEffect(() => {
    onDirtyChange?.(editor.dirty || bulkDirty);
  }, [editor.dirty, bulkDirty, onDirtyChange]);

  /** Leaving the Add tab with unsaved batch JSON needs an explicit discard. */
  const leaveBulk = async () =>
    mode !== 'bulk' || !bulkDirty || (await confirmation.request('Discard the unsaved batch JSON to continue?'));
  const showSingle = async () => {
    if (await leaveBulk()) setMode('single');
  };
  const chooseBulk = (target: BulkTarget) => {
    setBulkTarget(target);
    setMode('bulk');
  };
  const bulkFor = (kind: BulkTarget['kind']) =>
    chooseBulk({ kind, subjectId: selectedSubject?.id, topicId: selectedTopic?.id, quizId: selectedQuiz?.id });
  const browse = async (subjectId: string, topicId?: string, quizId?: string) => {
    if (!(await leaveBulk())) return false;
    const moved = await editor.select(
      quizId
        ? { kind: 'quiz', id: quizId, parentId: topicId }
        : topicId
          ? { kind: 'topic', id: topicId, parentId: subjectId }
          : { kind: 'subject', id: subjectId || undefined },
    );
    if (moved) setMode('single');
    return moved;
  };
  const newTopic = async (subjectId: string) => {
    if ((await leaveBulk()) && (await editor.loadNew('topic', subjectId))) setMode('single');
  };
  const siblings =
    selection.kind === 'topic'
      ? bank.topics.filter((row) => row.subjectId === selection.parentId)
      : selection.kind === 'quiz'
        ? bank.quizzes.filter((row) => row.topicId === selection.parentId)
        : bank.questions.filter((row) => row.quizId === selection.parentId);
  const siblingIndex = siblings.findIndex((row) => row.id === selection.id);
  const reorder = async (direction: -1 | 1) => {
    if (!selection.id) return;
    const { kind, id } = selection;
    const record = store.find(kind, id);
    const target = reorderTarget(siblings, id, direction);
    if (!record || !target) return;
    setWorking(true);
    setActionError('');
    try {
      await store.move(kind, id, record.version, target);
    } catch (error) {
      setActionError(errorMessages(error).join(' '));
    } finally {
      setWorking(false);
    }
  };
  const movable = Boolean(selection.id) && selection.kind !== 'subject';

  return (
    <Stack
      direction={{ xs: 'column', lg: 'row' }}
      spacing={2}
      alignItems="flex-start"
    >
      {confirmation.dialog}
      {editor.discardDialog}
      <AdminNavigatorPanel
        disabled={locked}
        onManageSubjects={onManageSubjects}
        onBrowseChange={browse}
        bank={bank}
        selection={selection}
        selectedSubjectId={selectedSubject?.id}
        selectedTopicId={selectedTopic?.id}
        selectedQuizId={selectedQuiz?.id}
        onNewTopic={(subjectId) => void newTopic(subjectId)}
        filter={filter}
        setFilter={setFilter}
        loadEntity={(next, record) => {
          void leaveBulk()
            .then((left) => left && editor.load(next, record))
            .then((ok) => ok && setMode('single'));
        }}
        chooseBulkTarget={(kind, context) => chooseBulk({ kind, ...context })}
        onDelete={(target, label) => onDelete({ selection: target, label })}
        onDeleteMany={(kind, parentId, ids) =>
          onDelete({
            selection: { kind, parentId },
            label: `${ids.length} selected ${kind === 'question' ? 'items' : kind === 'quiz' ? 'quizzes' : 'topics'}`,
            ids,
          })
        }
      />
      <AdminEditorFrame label="Quiz editor">
        <Tabs
          value={mode}
          onChange={(_, value) => {
            if (value === 'bulk')
              bulkFor(selectedQuiz ? 'quiz' : selectedTopic ? 'topic' : 'subject');
            else void showSingle();
          }}
        >
          <Tab value="single" label="Record" />
          <Tab value="bulk" label="Add" />
        </Tabs>
        {mode === 'bulk' ? (
          <QuizBulkAdd
            store={store}
            target={bulkTarget}
            blocked={locked}
            onTargetChange={setBulkTarget}
            onDirtyChange={setBulkDirty}
            onAdded={({ subjectId, topicId, quizId }) => {
              void editor
                .select(
                  quizId && topicId
                    ? { kind: 'quiz', id: quizId, parentId: topicId }
                    : { kind: 'subject', id: subjectId },
                )
                .then((ok) => ok && setMode('single'));
            }}
          />
        ) : !editor.open ? (
          <AdminEditorEmpty
            title={
              !selectedSubject
                ? 'Choose a subject'
                : !selectedTopic
                  ? 'Choose a topic'
                  : !selectedQuiz
                    ? 'Choose a quiz'
                    : 'Choose a question'
            }
          >
            <Button
              onClick={() =>
                !selectedSubject
                  ? onManageSubjects()
                  : !selectedTopic
                    ? void newTopic(selectedSubject.id)
                    : bulkFor(selectedQuiz ? 'quiz' : 'topic')
              }
            >
              {!selectedSubject ? 'Add subject' : !selectedTopic ? 'New topic' : selectedQuiz ? 'Add questions' : 'Add quizzes'}
            </Button>
          </AdminEditorEmpty>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Typography variant="h6">
              {selection.id ? 'Edit' : 'New'} {selection.kind}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[selectedSubject?.name, selectedTopic?.name, selectedQuiz?.name, selection.id].filter(Boolean).join(' / ')}
            </Typography>
            <AdminRecordEditor
              kind={selection.kind}
              existing={Boolean(selection.id)}
              expectedId={selection.id}
              text={editor.text}
              onChange={editor.edit}
            />
            {actionError && (
              <Alert severity="error" onClose={() => setActionError('')}>
                {actionError}
              </Alert>
            )}
            <AdminRecordFeedback
              issues={editor.issues}
              notice={editor.notice}
              conflict={editor.conflict}
              busy={locked}
              onUseServer={editor.takeServerVersion}
              onKeepMine={editor.keepMine}
            />
            <AdminEditorActions dirty={editor.dirty} busy={locked}>
              <Button variant="contained" disabled={locked || !editor.text.trim()} onClick={() => void editor.save()}>
                Save
              </Button>
              <AdminRecordMenu
                disabled={locked}
                items={[
                  { label: 'New subject', onClick: () => onManageSubjects() },
                  {
                    label: 'New topic',
                    disabled: !selectedSubject,
                    onClick: () => selectedSubject && void newTopic(selectedSubject.id),
                  },
                  { label: 'Add quizzes', disabled: !selectedTopic, onClick: () => bulkFor('topic') },
                  {
                    label: 'New item',
                    disabled: !selectedQuiz,
                    onClick: () => selectedQuiz && void editor.loadNew('question', selectedQuiz.id),
                  },
                  {
                    label: 'Delete…',
                    hidden: !selection.id,
                    onClick: () =>
                      onDelete({ selection: { kind: selection.kind, id: selection.id, parentId: selection.parentId }, label: selection.id! }),
                  },
                  {
                    label: 'Move up',
                    hidden: !movable,
                    disabled: editor.dirty || siblingIndex <= 0,
                    onClick: () => void reorder(-1),
                  },
                  {
                    label: 'Move down',
                    hidden: !movable,
                    disabled: editor.dirty || siblingIndex < 0 || siblingIndex + 1 >= siblings.length,
                    onClick: () => void reorder(1),
                  },
                ]}
              />
            </AdminEditorActions>
          </Stack>
        )}
      </AdminEditorFrame>
    </Stack>
  );
}
