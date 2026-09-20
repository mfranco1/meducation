import { ThemeProvider } from '@mui/material';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme';
import { CelebrationOverlay } from './CelebrationOverlay';
import { RadiatingCircles } from './RadiatingCircles';

const renderWithTheme = (ui: React.ReactNode) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

afterEach(() => vi.useRealTimers());

describe('radiating circles', () => {
  it('renders the configured decorative circle count', () => {
    renderWithTheme(<RadiatingCircles particleCount={7} durationMs={600} colors={['#a0d8b0', '#2f7a55']} />);
    expect(screen.getByTestId('radiating-circles')).toHaveAttribute('aria-hidden', 'true');
    const particles = screen.getAllByTestId('radiating-circle');
    expect(particles).toHaveLength(7);
    expect(particles[0]).toHaveStyle({ backgroundColor: '#2f7a55' });
    expect(particles[1]).toHaveStyle({ backgroundColor: '#a0d8b0' });
    expect(getComputedStyle(particles[0]).animation).toContain('600ms');
    expect(getComputedStyle(particles[1]).animation).toContain('600ms');
  });

  it('omits particles when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderWithTheme(<RadiatingCircles />);
    expect(screen.queryByTestId('radiating-circles')).toBeNull();
  });
});

describe('celebration overlay', () => {
  it('announces its copy and completes after its configured duration', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderWithTheme(<CelebrationOverlay open title="3 in a row!" message="Keep going." variant="streak" durationMs={100} onComplete={onComplete} />);
    expect(screen.getByRole('status')).toHaveTextContent('3 in a row!Keep going.');
    expect(screen.getByTestId('radiating-circles')).toHaveAttribute('aria-hidden', 'true');
    act(() => vi.advanceTimersByTime(100));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
