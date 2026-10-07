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
    const finishButton = screen.getByRole('button', { name: 'Finish' });
    expect(finishButton).toBeEnabled();
    expect(finishButton).toHaveClass('MuiButton-containedPrimary');
    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} index={1} revealed /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('renders multi-paragraph fronts and backs vertically and keeps the flag button quiet', () => {
    const multiBlock: FlashcardCard[] = [{ id: 'f-blocks', deckId: 'd1', front: 'Front one.\n\nFront two.', back: 'Back one.\n\nBack two.' }];
    const props = { deck: { ...deck, cardCount: 1, cardIds: ['f-blocks'] }, cards: multiBlock, index: 0, onReveal: vi.fn(), onToggleFlag: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn(), onSaveAndExit: vi.fn(), onFinish: vi.fn() };
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} revealed={false} /></ThemeProvider>);
    const frontOne = screen.getByText('Front one.');
    const frontTwo = screen.getByText('Front two.');
    expect(frontOne.parentElement?.parentElement).toBe(frontTwo.parentElement?.parentElement);
    const flag = screen.getByRole('button', { name: 'Flag card' });
    expect(flag.querySelector('.MuiTouchRipple-root')).toBeNull();
    fireEvent.click(flag);
    expect(props.onToggleFlag).toHaveBeenCalledOnce();

    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} revealed /></ThemeProvider>);
    const backOne = screen.getByText('Back one.');
    const backTwo = screen.getByText('Back two.');
    expect(backOne.parentElement?.parentElement).toBe(backTwo.parentElement?.parentElement);
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

  it('uses unmodified arrow keys for bounded previous and next navigation', () => {
    const onPrevious = vi.fn(); const onNext = vi.fn(); const onFinish = vi.fn();
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={deck} cards={cards} index={0} revealed={false} onReveal={vi.fn()} onPrevious={onPrevious} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={onFinish} /></ThemeProvider>);

    const leftAtStart = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    fireEvent(window, leftAtStart);
    expect(leftAtStart.defaultPrevented).toBe(true);
    expect(onPrevious).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();

    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={deck} cards={cards} index={1} revealed onReveal={vi.fn()} onPrevious={onPrevious} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={onFinish} /></ThemeProvider>);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrevious).toHaveBeenCalledOnce();

    for (const modifiers of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }]) {
      fireEvent.keyDown(window, { key: 'ArrowLeft', ...modifiers });
    }
    fireEvent.keyDown(window, { key: 'x' });
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('lets arrow keys work on ordinary buttons while preserving editable and arrow-widget behavior', () => {
    const onNext = vi.fn();
    render(<ThemeProvider theme={theme}><><FlashcardStudyScreen deck={deck} cards={cards} index={0} revealed={false} onReveal={vi.fn()} onPrevious={vi.fn()} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /><input aria-label="Card note" /><div role="tablist"><button role="tab">Tab</button></div><a href="#source">Source link</a></></ThemeProvider>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reveal answer' }), { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card note' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('link', { name: 'Source link' }), { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('ignores arrow shortcuts while saving or when an event was already handled', () => {
    const onNext = vi.fn();
    const props = { deck, cards, index: 0, revealed: false, onReveal: vi.fn(), onPrevious: vi.fn(), onNext, onSaveAndExit: vi.fn(), onFinish: vi.fn() };
    const { rerender } = render(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} saving /></ThemeProvider>);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();

    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen {...props} /></ThemeProvider>);
    const alreadyHandled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    alreadyHandled.preventDefault();
    fireEvent(window, alreadyHandled);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('suspends arrow shortcuts while a modal is open and ignores them for a one-card deck', () => {
    const onPrevious = vi.fn(); const onNext = vi.fn();
    const singleDeck = { ...deck, cardCount: 1, cardIds: ['f1'] };
    const { rerender } = render(<ThemeProvider theme={theme}><><FlashcardStudyScreen deck={singleDeck} cards={[cards[0]]} index={0} revealed={false} onReveal={vi.fn()} onPrevious={onPrevious} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /><div role="dialog" aria-modal="true">Open dialog</div></></ThemeProvider>);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    rerender(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={singleDeck} cards={[cards[0]]} index={0} revealed={false} onReveal={vi.fn()} onPrevious={onPrevious} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('moves focus from Next to Finish when ArrowRight advances from a focused Next button', () => {
    const onFinish = vi.fn();
    function FocusedDeck() {
      const [index, setIndex] = useState(0);
      return <FlashcardStudyScreen deck={deck} cards={cards} index={index} revealed={false} onReveal={vi.fn()} onPrevious={vi.fn()} onNext={() => setIndex(1)} onSaveAndExit={vi.fn()} onFinish={onFinish} />;
    }
    render(<ThemeProvider theme={theme}><FocusedDeck /></ThemeProvider>);
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Finish' })).toHaveFocus();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('suspends arrow shortcuts while the Cards drawer is open and restores them when closed', async () => {
    const onNext = vi.fn();
    render(<ThemeProvider theme={theme}><FlashcardStudyScreen deck={deck} cards={cards} index={0} revealed={false} onReveal={vi.fn()} onPrevious={vi.fn()} onNext={onNext} onSaveAndExit={vi.fn()} onFinish={vi.fn()} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.MuiBackdrop-root')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();
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
