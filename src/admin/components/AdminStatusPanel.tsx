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
}

export function AdminStatusPanel({ bank, issues, questionPaths = {}, summary, editorDirty, busy }: Props) {
  const hasErrors = issues.some((issue) => issue.level === 'error');
  const hasWarnings = issues.some((issue) => issue.level === 'warning');
  const statusColor = hasErrors ? 'error.main' : hasWarnings || editorDirty ? 'warning.dark' : 'text.secondary';
  return (
    <Paper variant="outlined" sx={{ ...adminStatusLayout, p: 2 }} aria-label="Admin status">
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" color="text.secondary">
          {bank.subjects.length} subjects · {bank.quizzes.length} quizzes · {bank.questions.length} items
        </Typography>
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
          <Typography variant="body2" color="text.secondary">
            {summary}
          </Typography>
        )}
        {issues.length > 0 && <AdminIssues issues={issues} questionPaths={questionPaths} />}
      </Stack>
    </Paper>
  );
}
