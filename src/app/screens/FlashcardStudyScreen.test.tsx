import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCard } from '../../domain/types';
import { theme } from '../theme';
import { FlashcardStudyScreen } from './FlashcardStudyScreen';

const deck = { id: 'd1', subjectId: 's1', name: 'Brachial plexus', cardCount: 2, cardIds: ['f1', 'f2'] };
const cards: FlashcardCard[] = [
  { id: 'f1', deckId: 'd1', front: 'What forms the **cords**?', back: 'The axillary artery.' },
  { id: 'f2', deckId: 'd1', front: 'Second front', back: 'Second back' },
];

describe('FlashcardStudyScreen', () => {
  it('keeps the back hidden until reveal and requires explicit finish on the last card', () => {
    const onReveal = vi.fn(); const onNext = vi.fn(); const onFinish = vi.fn();
    const props = { deck, cards, index: 0, revealed: false, onReveal, onPrevious: vi.fn(), onNext, onSaveAndExit: vi.fn(), onFinish };
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} /></ThemeProvider>);
    expect(screen.getByText(/What forms the/)).toHaveTextContent('What forms the cords?');
    expect(screen.queryByText('The axillary artery.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(onReveal).toHaveBeenCalledOnce();
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} index={1} revealed={false} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Finish deck' })).toBeEnabled();
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} index={1} revealed /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Finish deck' }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('renders long Markdown, a safe local diagram, and LaTeX without truncating the face', () => {
    const longText = 'Detailed anatomy content. '.repeat(120);
    const richCards: FlashcardCard[] = [{
      id: 'f-rich', deckId: 'd1', front: `${longText}\n\n![Nerve diagram](/content/nerve.png)\n\n$$x^2$$`, back: 'Answer',
    }];
    render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={{ ...deck, cardCount: 1, cardIds: ['f-rich'] }} cards={richCards} index={0} revealed={false} onReveal={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    expect(document.body.textContent).toContain('Detailed anatomy content.');
    const renderedFace = Array.from(document.querySelectorAll('h5, p')).map(element => element.textContent ?? '').find(text => text.includes('Detailed anatomy content.'));
    expect(renderedFace?.length).toBeGreaterThan(longText.length - 2);
    expect(screen.getByRole('img', { name: 'Nerve diagram' })).toHaveAttribute('src', '/content/nerve.png');
    expect(document.querySelector('.katex')).toBeInTheDocument();
  });
});
