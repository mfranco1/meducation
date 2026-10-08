import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/question-bank.json';
import type { StoredQuestionBank } from '../../content/schema/schema';
import type { ValidationIssue } from '../../content/validation/validate';
import { theme } from '../../shared/theme';
import { AdminStatusPanel } from './AdminStatusPanel';

const bank = fixture as StoredQuestionBank;

describe('admin status presentation contracts', () => {
  it.each([
    [false, false, 'No changes'],
    [false, true, 'Exported'],
    [true, true, 'Not exported'],
  ])('describes the workspace in text (dirty=%s, exported=%s)', (dirty, exported, expected) => {
    render(
      <ThemeProvider theme={theme}>
        <AdminStatusPanel
          bank={bank}
          issues={[]}
          summary="Load a record or paste a change set."
          dirty={dirty}
          exported={exported}
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Admin status')).toHaveTextContent(expected);
    expect(screen.queryByLabelText('Validation issues')).toBeNull();
    expect(screen.queryByText('Load a record or paste a change set.')).toBeNull();
  });

  it('keeps diagnostics, record paths, busy feedback, and summaries available regardless of status color', () => {
    const issues: ValidationIssue[] = [
      { level: 'warning', questionId: 'i1', message: 'Review the provided key.' },
      { level: 'error', questionId: 'i3', message: 'Missing rationale.' },
    ];
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <AdminStatusPanel
          bank={bank}
          issues={issues}
          questionPaths={{ i1: '$.items[0]' }}
          summary="Batch rejected."
          dirty
          exported={false}
          busy="Validating"
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Admin status')).toHaveTextContent('Needs attention');
    expect(screen.getByRole('status')).toHaveTextContent('Validating');
    expect(screen.getByText('Batch rejected.')).toBeVisible();
    const diagnostics = screen.getByLabelText('Validation issues');
    expect(diagnostics).toHaveTextContent('WARNING $.items[0]: Review the provided key.');
    expect(diagnostics).toHaveTextContent('ERROR [i3]: Missing rationale.');
    rerender(
      <ThemeProvider theme={theme}>
        <AdminStatusPanel
          bank={bank}
          issues={issues.slice(0, 1)}
          summary="Review before staging."
          dirty
          exported={false}
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Admin status')).toHaveTextContent('Review warnings');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
