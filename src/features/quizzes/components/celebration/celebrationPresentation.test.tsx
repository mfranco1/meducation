import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../../shared/theme';
import { CelebrationOverlay } from './CelebrationOverlay';
import { RadiatingCircles } from './RadiatingCircles';

const renderWithTheme = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

// React selects the prefixed event in jsdom, which has no AnimationEvent constructor.
const finishAnimation = (element: HTMLElement) => fireEvent(element, new Event('AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd', { bubbles: true }));

afterEach(() => vi.useRealTimers());

describe('radiating circles', () => {
  it('renders the configured decorative circle count', () => {
    renderWithTheme(<RadiatingCircles particleCount={7} durationMs={600} colors={['#a0d8b0', '#2f7a55']} />);
    expect(screen.getByTestId('radiating-circles')).toHaveAttribute('aria-hidden', 'true');
    const particles = screen.getAllByTestId('radiating-circle');
    expect(particles).toHaveLength(7);
    expect(particles[0]).toHaveStyle({ backgroundColor: '#2f7a55' });
    expect(particles[1]).toHaveStyle({ backgroundColor: '#a0d8b0' });
  });

  it('omits particles when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderWithTheme(<RadiatingCircles />);
    expect(screen.queryByTestId('radiating-circles')).toBeNull();
  });
});

describe('celebration overlay', () => {
  it('prepares playback before starting and completes only when the card finishes', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderWithTheme(<CelebrationOverlay open title="3 in a row!" message="Keep going." variant="streak" level={3} durationMs={100} onComplete={onComplete} />);
    const status = screen.getByRole('status');
    const card = screen.getByTestId('celebration-card');
    expect(status).toHaveTextContent('3 in a row!Keep going.');
    expect(status).toHaveStyle({ opacity: '0' });
    expect(screen.getByTestId('gold-burst')).toHaveAttribute('aria-hidden', 'true');
    finishAnimation(card);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(status).not.toHaveStyle({ opacity: '0' });
    expect(onComplete).not.toHaveBeenCalled();
    finishAnimation(screen.getByTestId('gold-burst'));
    expect(onComplete).not.toHaveBeenCalled();
    finishAnimation(card);
    finishAnimation(card);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('starts fresh after closing and reopening, including during preparation', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const overlay = (open: boolean) => <ThemeProvider theme={theme}><CelebrationOverlay open={open} title="Streak" message="Keep going." variant="streak" level={1} onComplete={onComplete} /></ThemeProvider>;
    const { rerender, unmount } = render(overlay(true));
    act(() => vi.advanceTimersToNextFrame());
    rerender(overlay(false));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('status')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    rerender(overlay(true));
    expect(screen.getByRole('status')).toHaveStyle({ opacity: '0' });
    act(() => vi.advanceTimersByTime(1000));
    finishAnimation(screen.getByTestId('celebration-card'));
    expect(onComplete).toHaveBeenCalledOnce();
    rerender(overlay(false));
    rerender(overlay(true));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('shows its copy and completes without the gold burst when reduced motion is preferred', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderWithTheme(<CelebrationOverlay open title="50-in-a-row!" message="Exceptional mastery!" variant="streak" level={5} onComplete={onComplete} />);
    expect(screen.getByRole('status')).toHaveTextContent('50-in-a-row!Exceptional mastery!');
    expect(screen.queryByTestId('gold-burst')).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    finishAnimation(screen.getByTestId('celebration-card'));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
