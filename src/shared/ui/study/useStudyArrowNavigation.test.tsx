import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStudyArrowNavigation } from './useStudyArrowNavigation';

function Harness({ total = 2, disabled = false, onMove = vi.fn() }: { total?: number; disabled?: boolean; onMove?: (index: number) => void }) {
  const [index, setIndex] = useState(0);
  useStudyArrowNavigation({ index, total, disabled, onPrevious: () => { onMove(index - 1); setIndex(value => value - 1); }, onNext: () => { onMove(index + 1); setIndex(value => value + 1); } });
  return <div><span>Item {index + 1}</span><button>Ordinary button</button><input aria-label="Editable" /><a href="#source">Source</a><div role="tablist"><button role="tab">Tab</button></div><div role="radiogroup"><button role="radio">Choice</button></div></div>;
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
    for (const modifiers of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { repeat: true }]) fireEvent.keyDown(window, { key: 'ArrowRight', ...modifiers });
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
    const { rerender } = render(<><Harness onMove={onMove} /><div role="dialog" aria-modal="true">Modal</div></>);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    rerender(<Harness disabled onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).not.toHaveBeenCalled();
    rerender(<Harness onMove={onMove} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledOnce();
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
