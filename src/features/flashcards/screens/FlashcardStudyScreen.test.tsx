import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { markdownReady } from '../../../test/markdownReady';
import type { FlashcardCard } from '../../../domain/types';
import { theme } from '../../../shared/theme';
import { FlashcardStudyScreen } from './FlashcardStudyScreen';

beforeAll(markdownReady, 30000);

const deck = { id: 'd1', subjectId: 's1', topicId: 't1', name: 'Brachial plexus', cardCount: 2, cardIds: ['f1', 'f2'] };
const cards: FlashcardCard[] = [
  { id: 'f1', deckId: 'd1', front: 'What forms the **cords**?', back: 'The axillary artery.' },
  { id: 'f2', deckId: 'd1', front: 'Second front', back: 'Second back' },
];

describe('FlashcardStudyScreen', () => {
  it('keeps the back hidden until reveal and requires explicit finish on the last card', () => {
    const onReveal = vi.fn();
    const onNext = vi.fn();
    const onFinish = vi.fn();
    const props = {
      deck,
      cards,
      index: 0,
      revealed: false,
      onReveal,
      onPrevious: vi.fn(),
      onNext,
      onSaveAndExit: vi.fn(),
      onFinish,
    };
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen {...props} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/What forms the/)).toHaveTextContent('What forms the cords?');
    expect(screen.getByRole('group', { name: 'Hidden flashcard answer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(onReveal).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Hide answer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal answer' })).not.toHaveTextContent('Meducation');
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen {...props} index={1} revealed={false} />
      </ThemeProvider>,
    );
    const finishButton = screen.getByRole('button', { name: 'Finish' });
    expect(finishButton).toBeEnabled();
    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen {...props} index={1} revealed />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('renders multi-paragraph fronts and backs and toggles the flag', () => {
    const multiBlock: FlashcardCard[] = [
      { id: 'f-blocks', deckId: 'd1', front: 'Front one.\n\nFront two.', back: 'Back one.\n\nBack two.' },
    ];
    const props = {
      deck: { ...deck, cardCount: 1, cardIds: ['f-blocks'] },
      cards: multiBlock,
      index: 0,
      onReveal: vi.fn(),
      onToggleFlag: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onSaveAndExit: vi.fn(),
      onFinish: vi.fn(),
    };
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen {...props} revealed={false} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Front one.')).toBeVisible();
    expect(screen.getByText('Front two.')).toBeVisible();
    const flag = screen.getByRole('button', { name: 'Flag card' });
    fireEvent.click(flag);
    expect(props.onToggleFlag).toHaveBeenCalledOnce();

    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen {...props} revealed />
      </ThemeProvider>,
    );
    expect(screen.getByText('Back one.')).toBeVisible();
    expect(screen.getByText('Back two.')).toBeVisible();
  });

  it('hides an opened card when its face is clicked, but not when an answer link is clicked', () => {
    const onReveal = vi.fn();
    const linkedCards: FlashcardCard[] = [
      { id: 'f-link', deckId: 'd1', front: 'Prompt', back: 'A bold answer with [a source](https://example.com).' },
    ];
    render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={{ ...deck, cardCount: 1, cardIds: ['f-link'] }}
          cards={linkedCards}
          index={0}
          revealed
          onReveal={onReveal}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'a source' }));
    expect(onReveal).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('group', { name: 'Answer revealed. Click to hide or press Space or Enter to continue.' }),
    );
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('does not truncate long card faces', () => {
    const longText = 'Detailed anatomy content. '.repeat(120);
    const longCards: FlashcardCard[] = [{ id: 'f-long', deckId: 'd1', front: longText, back: longText }];
    render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={{ ...deck, cardCount: 1, cardIds: ['f-long'] }}
          cards={longCards}
          index={0}
          revealed={false}
          onReveal={vi.fn()}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /Detailed anatomy content/ }).textContent).toBe(longText.trim());
    expect(screen.getByRole('group', { name: 'Hidden flashcard answer' }).textContent).toContain(longText.trim());
  });

  it('opens by Space, flags independently, and jumps from the card navigator', () => {
    const onReveal = vi.fn();
    const onToggleFlag = vi.fn();
    const onNavigate = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={deck}
          cards={cards}
          index={0}
          revealed={false}
          onReveal={onReveal}
          onToggleFlag={onToggleFlag}
          onNavigate={onNavigate}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole('heading', { name: /What forms the cords/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(onReveal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Flag card' }));
    expect(onToggleFlag).toHaveBeenCalledWith('f1');
    fireEvent.click(screen.getByRole('button', { name: 'Card 2, unopened' }));
    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Save and exit deck' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hidden cards, 2' })).toHaveTextContent('Hidden');
  });

  it.each([{ code: 'Space' }, { key: 'Enter' }])(
    'uses %o to reveal each answer and then advance through the deck',
    (press) => {
      const onFinish = vi.fn();
      function KeyboardDeck() {
        const [index, setIndex] = useState(0);
        const [revealed, setRevealed] = useState(false);
        return (
          <FlashcardStudyScreen
            deck={deck}
            cards={cards}
            index={index}
            revealed={revealed}
            onReveal={() => setRevealed((value) => !value)}
            onNext={() => {
              setIndex((value) => value + 1);
              setRevealed(false);
            }}
            onPrevious={vi.fn()}
            onSaveAndExit={vi.fn()}
            onFinish={onFinish}
          />
        );
      }
      render(
        <ThemeProvider theme={theme}>
          <KeyboardDeck />
        </ThemeProvider>,
      );
      const revealedName = 'Answer revealed. Click to hide or press Space or Enter to continue.';

      fireEvent.keyDown(window, press);
      expect(screen.getByRole('group', { name: revealedName })).toHaveFocus();
      fireEvent.keyDown(window, press);
      expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument();
      fireEvent.keyDown(window, press);
      expect(screen.getByRole('group', { name: revealedName })).toBeInTheDocument();
      fireEvent.keyDown(window, press);
      expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
    },
  );

  it('wires ArrowLeft and ArrowRight to previous and next', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={deck}
          cards={cards}
          index={0}
          revealed={false}
          onReveal={vi.fn()}
          onPrevious={onPrevious}
          onNext={onNext}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledOnce();

    rerender(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={deck}
          cards={cards}
          index={1}
          revealed
          onReveal={vi.fn()}
          onPrevious={onPrevious}
          onNext={onNext}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it('moves focus from Next to Finish when ArrowRight advances from a focused Next button', () => {
    const onFinish = vi.fn();
    function FocusedDeck() {
      const [index, setIndex] = useState(0);
      return (
        <FlashcardStudyScreen
          deck={deck}
          cards={cards}
          index={index}
          revealed={false}
          onReveal={vi.fn()}
          onPrevious={vi.fn()}
          onNext={() => setIndex(1)}
          onSaveAndExit={vi.fn()}
          onFinish={onFinish}
        />
      );
    }
    render(
      <ThemeProvider theme={theme}>
        <FocusedDeck />
      </ThemeProvider>,
    );
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(next, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Finish' })).toHaveFocus();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('opens the Cards drawer and closes it after an arbitrary jump', async () => {
    const onNavigate = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <FlashcardStudyScreen
          deck={deck}
          cards={cards}
          index={0}
          revealed={false}
          onReveal={vi.fn()}
          onNavigate={onNavigate}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onSaveAndExit={vi.fn()}
          onFinish={vi.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    const cardTwo = screen.getAllByRole('button', { name: 'Card 2, unopened' });
    fireEvent.click(cardTwo.at(-1)!);
    expect(onNavigate).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
