import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardCard } from '../../../domain/types';
import { theme } from '../../../shared/theme';
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
    expect(screen.getByText('The axillary artery.').closest('[aria-hidden="true"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(onReveal).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Hide answer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).not.toHaveTextContent('Meducation');
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} index={1} revealed={false} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Finish deck' })).toBeEnabled();
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} index={1} revealed /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Finish deck' }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('hides an opened card when its face is clicked, while preserving answer links', () => {
    const onReveal = vi.fn();
    const linkedCards: FlashcardCard[] = [{ id: 'f-link', deckId: 'd1', front: 'Prompt', back: 'A bold answer with [a source](https://example.com).' }];
    render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={{ ...deck, cardCount: 1, cardIds: ['f-link'] }} cards={linkedCards} index={0} revealed onReveal={onReveal} onPrevious={vi.fn()} onNext={vi.fn()} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText(/A bold answer with/)).toHaveStyle({ fontWeight: '700' });
    fireEvent.click(screen.getByRole('link', { name: 'a source' }));
    expect(onReveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('group', { name: 'Answer revealed. Click to hide or press Space to continue.' }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('renders long Markdown, a safe local diagram, and LaTeX without truncating the face', () => {
    const longText = 'Detailed anatomy content. '.repeat(120);
    const richCards: FlashcardCard[] = [{
      id: 'f-rich', deckId: 'd1', front: `${longText}\n\n![Nerve diagram](/content/nerve.png)\n\n$$x^2$$`, back: `${longText}\n\n**Answer** <em>with HTML</em>\n\n$$y^2$$\n\n<script>unsafe()</script>`,
    }];
    const props = { deck: { ...deck, cardCount: 1, cardIds: ['f-rich'] }, cards: richCards, index: 0, onReveal: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn(), onSaveAndExit: vi.fn(), onFinish: vi.fn() };
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} revealed={false} /></ThemeProvider>);
    expect(document.body.textContent).toContain('Detailed anatomy content.');
    const renderedFace = Array.from(document.querySelectorAll('h5, p')).map(element => element.textContent ?? '').find(text => text.includes('Detailed anatomy content.'));
    expect(renderedFace?.length).toBeGreaterThan(longText.length - 2);
    expect(screen.getByRole('group', { name: 'Hidden flashcard answer' }).textContent?.length).toBeGreaterThan(longText.length);
    const revealFace = screen.getByRole('button', { name: 'Reveal answer' });
    const hiddenAnswerFace = screen.getByRole('group', { name: 'Hidden flashcard answer' }).lastElementChild;
    expect(window.getComputedStyle(revealFace).gridArea).toBe(window.getComputedStyle(hiddenAnswerFace!).gridArea);
    expect(window.getComputedStyle(hiddenAnswerFace!.firstElementChild!).maxHeight).not.toBe('600px');
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} revealed /></ThemeProvider>);
    expect(screen.getByRole('img', { name: 'Nerve diagram' })).toHaveAttribute('src', '/content/nerve.png');
    expect(document.querySelector('.katex')).toBeInTheDocument();
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByText('with HTML').tagName).toBe('EM');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the deck title off-screen, opens by Space, flags independently, and jumps from the card navigator', () => {
    const onReveal = vi.fn(); const onToggleFlag = vi.fn(); const onNavigate = vi.fn();
    const { container } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={deck} cards={cards} index={0} revealed={false} onReveal={onReveal} onToggleFlag={onToggleFlag} onNavigate={onNavigate} onPrevious={vi.fn()} onNext={vi.fn()} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    expect(screen.queryByRole('heading', { name: 'Brachial plexus' })).toHaveStyle({ position: 'absolute' });
    expect(screen.getByRole('heading', { name: /What forms the cords/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(onReveal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Flag card' }));
    expect(onToggleFlag).toHaveBeenCalledWith('f1');
    fireEvent.click(screen.getByRole('button', { name: 'Card 2, unopened' }));
    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(container.querySelector('[aria-label="Card navigation"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and exit deck' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hidden cards, 2' })).toHaveTextContent('Hidden');
  });

  it('uses Space to reveal each answer and then advance through the deck', () => {
    const onFinish = vi.fn();
    function KeyboardDeck() {
      const [index, setIndex] = useState(0);
      const [revealed, setRevealed] = useState(false);
      return <FlashcardStudyScreen deck={deck} cards={cards} index={index} revealed={revealed} onReveal={() => setRevealed(value => !value)} onNext={() => { setIndex(value => value + 1); setRevealed(false); }} onPrevious={vi.fn()} onSaveAndExit={vi.fn()} onFinish={onFinish} />;
    }
    render(<ThemeProvider theme={theme}><KeyboardDeck /></ThemeProvider>);

    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByRole('group', { name: 'Answer revealed. Click to hide or press Space to continue.' })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByRole('group', { name: 'Answer revealed. Click to hide or press Space to continue.' })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('opens the Cards drawer and closes it after an arbitrary jump', async () => {
    const onNavigate = vi.fn();
    render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={deck} cards={cards} index={0} revealed={false} onReveal={vi.fn()} onNavigate={onNavigate} onPrevious={vi.fn()} onNext={vi.fn()} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    const cardTwo = screen.getAllByRole('button', { name: 'Card 2, unopened' });
    fireEvent.click(cardTwo.at(-1)!);
    expect(onNavigate).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
