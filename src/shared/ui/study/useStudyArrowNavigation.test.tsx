import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStudyArrowNavigation } from './useStudyArrowNavigation';

function Harness({
  total = 2,
  disabled = false,
  onMove = vi.fn(),
}: {
  total?: number;
  disabled?: boolean;
  onMove?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const swipeArea = useRef<HTMLDivElement>(null);
  useStudyArrowNavigation({
    swipeArea,
    index,
    total,
    disabled,
    onPrevious: () => {
      onMove(index - 1);
      setIndex((value) => value - 1);
    },
    onNext: () => {
      onMove(index + 1);
      setIndex((value) => value + 1);
    },
  });
  return (
    <div>
      <div ref={swipeArea}>
        Item {index + 1}
        <div data-testid="wide-table" style={{ overflowX: 'auto' }}>
          <span>Table cell</span>
        </div>
      </div>
      <nav>Navigator</nav>
      <button>Ordinary button</button>
      <input aria-label="Editable" />
      <a href="#source">Source</a>
      <div role="tablist">
        <button role="tab">Tab</button>
      </div>
      <div role="radiogroup">
        <button role="radio">Choice</button>
      </div>
    </div>
  );
}

describe('useStudyArrowNavigation', () => {
  it('moves both ways within bounds and consumes eligible boundary keys', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    fireEvent(window, left);
    expect(left.defaultPrevented).toBe(true);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledTimes(3);
  });

  it('leaves modifiers, composition, handled events, links, editors, and arrow widgets alone', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    for (const modifiers of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
      { repeat: true },
    ])
      fireEvent.keyDown(window, { key: 'ArrowRight', ...modifiers });
    const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    handled.preventDefault();
    fireEvent(window, handled);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editable' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('link', { name: 'Source' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radio'), { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ordinary button' }), { key: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('suspends for disabled state and visible modal dialogs, then resumes', () => {
    const onMove = vi.fn();
    const { rerender } = render(
      <>
        <Harness onMove={onMove} />
        <div role="dialog" aria-modal="true">
          Modal
        </div>
      </>,
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    rerender(<Harness disabled onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    rerender(<Harness onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledOnce();
  });

  it('moves on horizontal touch swipes that start on the item, outside sideways scrollers', () => {
    const onMove = vi.fn();
    render(<Harness total={3} onMove={onMove} />);
    const swipe = (element: Element, dx: number, dy = 0) => {
      fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 200 }] });
      fireEvent.touchEnd(element, { touches: [], changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }] });
    };
    swipe(screen.getByText('Item 1'), -100);
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    swipe(screen.getByText('Item 2'), 100);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    swipe(screen.getByText('Item 1'), -30);
    swipe(screen.getByText('Item 1'), -100, 120);
    swipe(screen.getByText('Navigator'), -100);
    expect(onMove).toHaveBeenCalledTimes(2);
    const table = screen.getByTestId('wide-table');
    Object.defineProperty(table, 'scrollWidth', { value: 800 });
    Object.defineProperty(table, 'clientWidth', { value: 300 });
    swipe(screen.getByText('Table cell'), -100);
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('moves once per sideways trackpad swipe on the item', () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    render(<Harness total={3} onMove={onMove} />);
    const swipe = (element: Element, deltaX: number, deltaY = 0) => {
      for (let step = 0; step < 5; step += 1) fireEvent.wheel(element, { deltaX, deltaY });
      vi.advanceTimersByTime(500);
    };
    swipe(screen.getByText('Item 1'), 40);
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    swipe(screen.getByText('Item 2'), -40);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    swipe(screen.getByText('Item 1'), 40, 60);
    swipe(screen.getByText('Navigator'), 40);
    expect(onMove).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('ignores empty or invalid positions and removes the listener when unmounted', () => {
    const onMove = vi.fn();
    const { rerender, unmount } = render(<Harness total={0} onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    rerender(<Harness total={1} onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
  });
});
