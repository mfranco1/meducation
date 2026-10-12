import { useEffect, useState } from 'react';
import { Button, List, ListItemText, Paper, Stack, Typography } from '@mui/material';
import type { StoredQuestionBank } from '../../content/schema/schema';
import type { ValidationIssue } from '../../content/validation/validate';

interface Props {
  bank: StoredQuestionBank;
  issues: ValidationIssue[];
  questionPaths?: Record<string, string>;
  summary: string;
  dirty: boolean;
  exported: boolean;
  busy?: string;
}

export function AdminStatusPanel({ bank, issues, questionPaths = {}, summary, dirty, exported, busy }: Props) {
  const [issuePage, setIssuePage] = useState(0);
  useEffect(() => { setIssuePage(0); }, [issues]);
  const hasErrors = issues.some(issue => issue.level === 'error');
  const hasWarnings = issues.some(issue => issue.level === 'warning');
  const statusColor = hasErrors ? 'error.main' : hasWarnings || dirty ? 'warning.dark' : exported ? 'success.main' : 'text.secondary';
  return <Paper variant="outlined" sx={{ width: { lg: 280 }, p: 2, alignSelf: 'flex-start' }} aria-label="Admin status">
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" color="text.secondary">{bank.subjects.length} subjects · {bank.quizzes.length} quizzes · {bank.questions.length} items</Typography>
      {busy && <Typography role="status" variant="body2">{busy}…</Typography>}
      <Typography fontWeight={700} color={statusColor}>{hasErrors ? 'Needs attention' : hasWarnings ? 'Review warnings' : dirty ? 'Not exported' : exported ? 'Exported' : 'No changes'}</Typography>
      {summary !== 'Load a record or paste a change set.' && <Typography variant="body2" color="text.secondary">{summary}</Typography>}
      {issues.length > 0 && <><Typography variant="caption" aria-live="polite">{issues.length} validation issue(s) · showing {issuePage * 10 + 1}–{Math.min(issues.length, (issuePage + 1) * 10)}</Typography><List dense disablePadding aria-label="Validation issues">{issues.slice(issuePage * 10, (issuePage + 1) * 10).map((issue, index) => {
        const path = issue.questionId ? questionPaths[issue.questionId] : undefined;
        const line = `${issue.level.toUpperCase()}${path ? ` ${path}` : issue.questionId ? ` [${issue.questionId}]` : ''}: ${issue.message}`;
        return <ListItemText key={`${index}-${line}`} primary={line} primaryTypographyProps={{ variant: 'body2', color: issue.level === 'error' ? 'error.main' : issue.level === 'warning' ? 'warning.dark' : 'text.secondary' }} />;
      })}</List>{issues.length > 10 && <Stack direction="row" justifyContent="space-between"><Button size="small" disabled={!issuePage} onClick={() => setIssuePage((page) => Math.max(0, page - 1))}>Previous</Button><Button size="small" disabled={(issuePage + 1) * 10 >= issues.length} onClick={() => setIssuePage((page) => page + 1)}>Next</Button></Stack>}</>}
    </Stack>
  </Paper>;
}
