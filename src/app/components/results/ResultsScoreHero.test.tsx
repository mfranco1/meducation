import { act, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { ResultsScoreHero, scoreAnimationDuration, scoreAnimationProgress, scoreRingColor } from './ResultsScoreHero';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let reducedMotion: MediaQueryList;
let reducedMotionListeners: Set<(event: MediaQueryListEvent) => void>;

function renderHero(ui: React.ReactElement) {
  return render(ui, { wrapper: ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider> });
}

function rgbChannels(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return color.match(/\d+/g)?.map(Number) ?? [];
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

describe('score animation helpers', () => {
  it('is bounded, monotonic, and joins the settling phase with matching velocity', () => {
    const samples = Array.from({ length: 1001 }, (_, index) => scoreAnimationProgress(index / 1000));
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(
      samples.every((value, index) => value >= 0 && value <= 1 && (index === 0 || value >= samples[index - 1])),
    ).toBe(true);
    expect(scoreAnimationProgress(0.65)).toBeCloseTo(0.85, 10);
    const epsilon = 0.00001;
    const leftVelocity = (scoreAnimationProgress(0.65) - scoreAnimationProgress(0.65 - epsilon)) / epsilon;
    const rightVelocity = (scoreAnimationProgress(0.65 + epsilon) - scoreAnimationProgress(0.65)) / epsilon;
    expect(leftVelocity).toBeCloseTo(rightVelocity, 3);
    expect(scoreAnimationProgress(0.9) - scoreAnimationProgress(0.89)).toBeLessThan(
      scoreAnimationProgress(0.3) - scoreAnimationProgress(0.29),
    );
    expect(scoreAnimationDuration(1)).toBeCloseTo(535, 0);
    expect(scoreAnimationDuration(10)).toBeCloseTo(719, 0);
    expect(scoreAnimationDuration(100)).toBe(1300);
  });

  it('blends score colors continuously around each threshold', () => {
    const colors = { low: '#b73b32', fair: '#c69a16', good: '#8ab85a', high: '#2f7a55' };
    expect(scoreRingColor(0, colors)).toBe(colors.low);
    expect(scoreRingColor(60, colors)).not.toBe(colors.low);
    expect(scoreRingColor(75, colors)).not.toBe(colors.fair);
    expect(scoreRingColor(90, colors)).not.toBe(colors.good);
    expect(scoreRingColor(100, colors)).toBe(colors.high);
    for (const boundary of [58, 63, 73, 78, 88, 93]) {
      const before = rgbChannels(scoreRingColor(boundary - 0.1, colors));
      const after = rgbChannels(scoreRingColor(boundary + 0.1, colors));
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(Math.max(...before!.map((channel, index) => Math.abs(channel - after![index])))).toBeLessThanOrEqual(3);
    }
    for (const score of [0, 1, 2, 5, 10, 60, 61, 75, 76, 90, 91, 99, 100]) {
      expect(scoreRingColor(score, colors)).toMatch(/^(rgb\(|#)/);
    }
  });
});

describe('ResultsScoreHero', () => {
  it('keeps the counter, arc, and color on one fast-then-settling timeline', () => {
    const percentage = 67;
    const duration = scoreAnimationDuration(percentage);
    const { rerender } = renderHero(<ResultsScoreHero key="attempt-1" percentage={percentage} />);
    expect(screen.getByTestId('score-ring-track')).toHaveAttribute('r', '47');
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();
    expect(screen.getByText(`Final score: ${percentage}%.`)).toBeInTheDocument();

    frameAt(1000);
    frameAt(1000 + duration * 0.3);
    const fastScore = Number(screen.getByTestId('score-percentage').textContent?.replace('%', ''));
    expect(fastScore).toBeGreaterThan(percentage * 0.3);
    const fastArc = screen.getByTestId('score-ring-arc');
    expect(Number(fastArc.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      100 - percentage * scoreAnimationProgress(0.3),
      4,
    );
    expect(fastArc.getAttribute('stroke')).not.toBe('#b9511b');

    frameAt(1000 + duration * 0.8);
    const settlingScore = Number(screen.getByTestId('score-percentage').textContent?.replace('%', ''));
    expect(settlingScore).toBeGreaterThan(fastScore);
    expect(settlingScore).toBeLessThan(percentage);

    rerender(<ResultsScoreHero key="attempt-1" percentage={percentage} />);
    expect(Number(screen.getByTestId('score-percentage').textContent?.replace('%', ''))).toBe(settlingScore);
    frameAt(1000 + duration + 100);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent(`${percentage}%`);
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '33');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke', '#c69a16');
    expect(frames.size).toBe(0);
  });

  it('handles zero, low scores, invalid inputs, and a complete ring', () => {
    const { rerender } = renderHero(<ResultsScoreHero key="zero" percentage={0} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    for (const percentage of [1, 2, 5, 10, 60, 61, 75, 76, 90, 91, 99]) {
      rerender(<ResultsScoreHero key={String(percentage)} percentage={percentage} />);
      expect(frames.size).toBe(1);
      expect(scoreAnimationDuration(percentage)).toBeLessThanOrEqual(scoreAnimationDuration(100));
      frameAt(1000 + scoreAnimationDuration(percentage));
      expect(screen.getByTestId('score-percentage')).toHaveTextContent(`${percentage}%`);
    }

    rerender(<ResultsScoreHero key="invalid" percentage={Number.NaN} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%');
    expect(screen.getByText('Final score: 0%.')).toBeInTheDocument();
    expect(screen.queryByTestId('score-ring-arc')).toBeNull();

    rerender(<ResultsScoreHero key="perfect" percentage={100} />);
    frameAt(1000 + scoreAnimationDuration(100));
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('100%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '0');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke', '#2f7a55');
    expect(screen.getByTestId('score-percentage')).toHaveStyle({
      width: '100%',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    });
  });

  it('shows final number, arc, and color immediately with reduced motion on load or mid-animation', () => {
    setReducedMotion(true);
    const { rerender } = renderHero(<ResultsScoreHero key="attempt-1" percentage={91} />);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('91%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '9');
    expect(screen.getByTestId('score-ring-arc').getAttribute('stroke')).toMatch(/^rgb\(/);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    setReducedMotion(false);
    rerender(<ResultsScoreHero key="attempt-2" percentage={40} />);
    expect(frames.size).toBe(1);
    setReducedMotion(true);
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('40%');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke-dashoffset', '60');
    expect(screen.getByTestId('score-ring-arc')).toHaveAttribute('stroke', '#b73b32');
    expect(frames.size).toBe(0);
  });

  it('cancels an old target animation and cleans up on unmount', () => {
    const { rerender, unmount } = renderHero(<ResultsScoreHero key="attempt-1" percentage={67} />);
    const oldFrame = [...frames.keys()][0];
    rerender(<ResultsScoreHero key="attempt-1" percentage={99} />);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(oldFrame);
    expect(frames.size).toBe(1);
    const frameId = [...frames.keys()][0];
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(frameId);
    expect(frames.size).toBe(0);
  });
});
