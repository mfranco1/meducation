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

  it('renders inline and display LaTeX alongside rich Markdown and HTML', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent contentKind="rich" markdown={'**Formula** $\\frac{MAP-RAP}{CO}$ and H<sub>2</sub>O.\n\n$$\nV_A=(V_T-V_D)\\times RR\n$$'} /></ThemeProvider>);
    expect(document.querySelectorAll('.katex')).toHaveLength(2);
    expect(document.querySelector('.katex-display')).toBeInTheDocument();
    expect(document.querySelector('.katex-mathml math')).not.toBeNull();
    expect(screen.getByText('Formula').tagName).toBe('STRONG');
    expect(screen.getByText('2', { selector: 'sub' })).toBeInTheDocument();
  });

  it('keeps dollar currency prose literal while rendering numeric math', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent contentKind="rich" markdown={'GDP is $500B; its citizens earn $100B abroad. This costs $10 per item and $20 each. The value is $600 \\times 12$.'} /></ThemeProvider>);
    expect(screen.getByText(/GDP is \$500B; its citizens earn \$100B abroad/)).toBeInTheDocument();
    expect([...document.querySelectorAll('.katex-mathml annotation')].map(annotation => annotation.textContent)).toEqual(['600 \\times 12']);
  });

  it('does not parse math delimiters in code and does not trust active TeX commands', () => {
    render(<ThemeProvider theme={theme}><MarkdownContent contentKind="rich" markdown={'`$x^2$`\n\n$\\href{javascript:alert(1)}{bad}$'} /></ThemeProvider>);
    expect(document.querySelectorAll('.katex')).toHaveLength(1);
    expect(document.querySelector('.katex a')).toBeNull();
    expect(screen.getByText('$x^2$')).toBeInTheDocument();
  });
});
