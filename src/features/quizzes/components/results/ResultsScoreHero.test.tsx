import { act, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../../shared/theme';
import { ResultsScoreHero, scoreAnimationDuration } from './ResultsScoreHero';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let reducedMotion: MediaQueryList;
let reducedMotionListeners: Set<(event: MediaQueryListEvent) => void>;

function renderHero(ui: React.ReactElement) {
  return render(ui, { wrapper: ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider> });
}

function frameAt(timestamp: number) {
  const current = [...frames.entries()];
  frames.clear();
  act(() => current.forEach(([, callback]) => callback(timestamp)));
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(reducedMotion, 'matches', { configurable: true, value: matches });
  act(() => reducedMotionListeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)));
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      frames.delete(id);
    }),
  );
  reducedMotionListeners = new Set();
  reducedMotion = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') reducedMotionListeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function')
        reducedMotionListeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn(() => reducedMotion);
});

afterEach(() => vi.restoreAllMocks());

describe('ResultsScoreHero', () => {
  it('reports settling once, at the end of the animation', () => {
    const onSettled = vi.fn();
    renderHero(<ResultsScoreHero percentage={67} onSettled={onSettled} />);
    frameAt(1000);
    frameAt(1000 + scoreAnimationDuration(67) * 0.5);
    expect(onSettled).not.toHaveBeenCalled();
    frameAt(1000 + scoreAnimationDuration(67) + 1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('jumps to the final score on skip and reports settling once', () => {
    const onSettled = vi.fn();
    const { rerender } = renderHero(<ResultsScoreHero percentage={67} onSettled={onSettled} />);
    frameAt(1000);
    frameAt(1000 + scoreAnimationDuration(67) * 0.3);
    rerender(<ResultsScoreHero percentage={67} onSettled={onSettled} skip />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('67%');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('holds a zero score briefly before settling', () => {
    vi.useFakeTimers();
    const onSettled = vi.fn();
    renderHero(<ResultsScoreHero percentage={0} onSettled={onSettled} />);
    vi.advanceTimersByTime(scoreAnimationDuration(0) - 1);
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('settles immediately with reduced motion', () => {
    setReducedMotion(true);
    const onSettled = vi.fn();
    renderHero(<ResultsScoreHero percentage={67} onSettled={onSettled} />);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('67%');
  });

  it('shows zero, invalid and complete scores', () => {
    const { rerender } = renderHero(<ResultsScoreHero key="zero" percentage={0} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();

    rerender(<ResultsScoreHero key="invalid" percentage={Number.NaN} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.getByText('Final score: 0%.')).toBeInTheDocument();

    rerender(<ResultsScoreHero key="perfect" percentage={100} />);
    frameAt(1000 + scoreAnimationDuration(100));
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('100%');
  });

  it('turns the ring gold once a perfect score settles', () => {
    renderHero(<ResultsScoreHero percentage={100} perfect />);
    frameAt(1000);
    frameAt(1000 + scoreAnimationDuration(100));
    expect(screen.getByTestId('score-ring-arc').getAttribute('stroke')).toMatch(/^url\(#/);
  });

  it('shows final number, arc, and color immediately with reduced motion on load or mid-animation', () => {
    setReducedMotion(true);
    const { rerender } = renderHero(<ResultsScoreHero key="attempt-1" percentage={91} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('91%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '9');
    expect(screen.getByTestId('score-ring-arc').getAttribute('stroke')).toMatch(/^rgb\(/);

    setReducedMotion(false);
    rerender(<ResultsScoreHero key="attempt-2" percentage={40} />);
    setReducedMotion(true);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('40%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '60');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke', '#b73b32');
  });
});
