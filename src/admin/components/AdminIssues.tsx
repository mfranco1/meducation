import { useEffect, useState } from 'react';
import { Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { ValidationIssue } from '../../content/validation/validate';

/** Paging is presentation only; the staging validators always receive all issues. */
export function AdminIssues({ issues, questionPaths = {} }: { issues: ValidationIssue[]; questionPaths?: Record<string, string> }) {
  const [page, setPage] = useState(0);
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');
  useEffect(() => { setPage(0); }, [issues, severity]);
  const errors = issues.filter(issue => issue.level === 'error').length;
  const warnings = issues.filter(issue => issue.level === 'warning').length;
  const filtered = issues.filter(issue => severity === 'all' || issue.level === severity).sort((left, right) => Number(right.level === 'error') - Number(left.level === 'error'));
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  return <Stack spacing={1}>
    <Typography variant="caption" aria-live="polite">{errors} errors · {warnings} warnings · {filtered.length ? safePage * 10 + 1 : 0}–{Math.min(filtered.length, (safePage + 1) * 10)} of {filtered.length} issues</Typography>
    {errors > 0 && warnings > 0 && <Stack direction="row" spacing={1}>{(['all', 'error', 'warning'] as const).map(value => <Button key={value} size="small" aria-pressed={severity === value} onClick={() => setSeverity(value)}>{value === 'all' ? 'All issues' : value === 'error' ? 'Errors' : 'Warnings'}</Button>)}</Stack>}
    <List dense disablePadding aria-label="Validation issues" sx={{ maxHeight: 320, overflowY: 'auto', overflowWrap: 'anywhere' }}>
      {filtered.slice(safePage * 10, (safePage + 1) * 10).map((issue, index) => {
        const path = issue.questionId ? questionPaths[issue.questionId] ?? `[${issue.questionId}]` : '';
        return <ListItem key={index} disableGutters><ListItemText primary={`${issue.level.toUpperCase()} ${path}: ${issue.message}`} primaryTypographyProps={{ variant: 'body2' }} /></ListItem>;
      })}
    </List>
    {filtered.length > 10 && <Stack direction="row" justifyContent="space-between"><Button size="small" disabled={!safePage} onClick={() => setPage(safePage - 1)}>Previous issue page</Button><Button size="small" disabled={(safePage + 1) * 10 >= filtered.length} onClick={() => setPage(safePage + 1)}>Next issue page</Button></Stack>}
  </Stack>;
}
