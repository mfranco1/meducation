import { Paper, Stack, Typography } from '@mui/material';
import { AdminIssues } from './AdminIssues';
import { adminStatusLayout } from './adminPanelLayout';
import type { StoredQuestionBank } from '../../content/schema/schema';
import type { ValidationIssue } from '../../content/validation/validate';

interface Props {
  bank: StoredQuestionBank;
  issues: ValidationIssue[];
  questionPaths?: Record<string, string>;
  summary: string;
  editorDirty: boolean;
  busy?: string;
  embedded?: boolean;
}

export function AdminStatusPanel({
  bank,
  issues,
  questionPaths = {},
  summary,
  editorDirty,
  busy,
  embedded = false,
}: Props) {
  const hasErrors = issues.some((issue) => issue.level === 'error');
  const hasWarnings = issues.some((issue) => issue.level === 'warning');
  const statusColor = hasErrors ? 'error.main' : hasWarnings || editorDirty ? 'warning.dark' : 'text.secondary';
  return (
    <Paper
      variant="outlined"
      sx={
        embedded
          ? { width: '100%', p: 2, mt: 2, border: 0, borderTop: 1, borderColor: 'divider' }
          : { ...adminStatusLayout, p: 2 }
      }
      aria-label="Admin status"
    >
      <Stack spacing={1.5}>
        {busy && (
          <Typography role="status" variant="body2">
            {busy}…
          </Typography>
        )}
        <Typography fontWeight={700} color={statusColor}>
          {hasErrors
            ? 'Needs attention'
            : hasWarnings
              ? 'Review warnings'
              : editorDirty
                ? 'Unsaved text'
                : 'Saved draft'}
        </Typography>
        {summary && summary !== 'Load a record or add content.' && (
          <Typography aria-live="polite" variant="body2" color="text.secondary">
            {summary}
          </Typography>
        )}
        {embedded ? (
          <details open={hasErrors || hasWarnings}>
            <summary>Validation &amp; details{issues.length ? ` · ${issues.length} issues` : ''}</summary>
            <Typography variant="subtitle2" color="text.secondary">
              {bank.subjects.length} subjects · {bank.quizzes.length} quizzes · {bank.questions.length} items
            </Typography>
            {issues.length > 0 && <AdminIssues issues={issues} questionPaths={questionPaths} />}
          </details>
        ) : (
          <>
            <Typography variant="subtitle2" color="text.secondary">
              {bank.subjects.length} subjects · {bank.quizzes.length} quizzes · {bank.questions.length} items
            </Typography>
            {issues.length > 0 && <AdminIssues issues={issues} questionPaths={questionPaths} />}
          </>
        )}
      </Stack>
    </Paper>
  );
}
