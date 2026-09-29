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

  it('renders approved basic HTML and images in rich content', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent contentKind="rich" markdown={'<b>Finding</b>: H<sub>2</sub>O <sup>2</sup>\n\n![Nerve diagram](/content/nerve.png)\n\n<img src="/content/artery.png" alt="Artery diagram" width="400">'} /></ThemeProvider>);
    expect(screen.getByText('Finding').tagName).toBe('B');
    expect(screen.getByText('2', { selector: 'sub' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nerve diagram' })).toHaveAttribute('loading', 'lazy');
    expect(screen.getByRole('img', { name: 'Artery diagram' })).toHaveAttribute('src', '/content/artery.png');
  });

  it('keeps raw HTML disabled outside rich content and strips unsafe rich markup', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent markdown={'<sub>2</sub>\n\n![diagram](/content/nerve.png)'} /></ThemeProvider>);
    expect(screen.queryByText('2', { selector: 'sub' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();

    render(<ThemeProvider theme={theme}><MarkdownContent contentKind="rich" markdown={'<script>alert(1)</script><img src="javascript:alert(1)" alt="bad" onerror="alert(1)">\n\n[bad](javascript:alert(1))'} /></ThemeProvider>);
    expect(screen.queryByText('alert(1)')).toBeNull();
    expect(screen.queryByRole('img', { name: 'bad' })).toBeNull();
    expect(screen.getByText('bad').tagName).not.toBe('A');
  });
});
