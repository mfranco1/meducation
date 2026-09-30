import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsScoreHero } from './ResultsScoreHero';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let now: number;
let reducedMotion: MediaQueryList;
let reducedMotionListeners: Set<(event: MediaQueryListEvent) => void>;

function frameAt(timestamp: number) {
  const current = [...frames.entries()];
  frames.clear();
  act(() => current.forEach(([, callback]) => callback(timestamp)));
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(reducedMotion, 'matches', { configurable: true, value: matches });
  act(() => reducedMotionListeners.forEach(listener => listener({ matches } as MediaQueryListEvent)));
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id); }));
  reducedMotionListeners = new Set();
  reducedMotion = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { if (typeof listener === 'function') reducedMotionListeners.add(listener as (event: MediaQueryListEvent) => void); },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => { if (typeof listener === 'function') reducedMotionListeners.delete(listener as (event: MediaQueryListEvent) => void); },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn(() => reducedMotion);
});

afterEach(() => vi.restoreAllMocks());

describe('ResultsScoreHero', () => {
  it('counts up and fills the ring from one animation value', () => {
    const { rerender } = render(<ResultsScoreHero key="attempt-1" percentage={67} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();
    expect(screen.getByText('Final score: 67%.')).toBeInTheDocument();

    frameAt(1000);
    frameAt(1300);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('59%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '41.375');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);

    rerender(<ResultsScoreHero key="attempt-1" percentage={67} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('59%');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);

    frameAt(1600);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('67%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '33');
    expect(frames.size).toBe(0);
  });

  it('keeps zero empty and draws a complete ring for a perfect score', () => {
    const { rerender } = render(<ResultsScoreHero key="zero" percentage={0} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    rerender(<ResultsScoreHero key="perfect" percentage={100} />);
    frameAt(1000);
    frameAt(1600);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('100%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '0');
  });

  it('shows the final value immediately with reduced motion, including when enabled mid-animation', () => {
    setReducedMotion(true);
    const { rerender } = render(<ResultsScoreHero key="attempt-1" percentage={67} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('67%');
    expect(screen.queryByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '33');
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    setReducedMotion(false);
    rerender(<ResultsScoreHero key="attempt-2" percentage={40} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(frames.size).toBe(1);
    setReducedMotion(true);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('40%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '60');
    expect(frames.size).toBe(0);
  });

  it('cancels the pending frame when unmounted', () => {
    const { unmount } = render(<ResultsScoreHero percentage={67} />);
    expect(frames.size).toBe(1);
    const frameId = [...frames.keys()][0];
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(frameId);
    expect(frames.size).toBe(0);
  });
});
