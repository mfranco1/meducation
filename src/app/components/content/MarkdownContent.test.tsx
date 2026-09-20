import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../theme';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders GFM tables, nested lists, and emphasis', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent markdown={'**Finding**\n\n- Parent\n  - Child\n\n| Test | Result |\n| - | - |\n| BP | 140/90 |'} /></ThemeProvider>);
    expect(screen.getByText('Finding').tagName).toBe('STRONG');
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('does not render raw HTML or unsafe URLs', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent markdown={'<script>alert(1)</script>\n\n[bad](javascript:alert(1))'} /></ThemeProvider>);
    expect(screen.queryByText('alert(1)')).toBeNull();
    expect(screen.getByText('bad').tagName).not.toBe('A');
  });
});
