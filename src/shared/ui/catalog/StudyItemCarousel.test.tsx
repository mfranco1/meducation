import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const carousel = vi.hoisted(() => ({
  snaps: [0, 1],
  selected: 0,
  canPrev: true,
  canNext: true,
  listeners: new Map<string, () => void>(),
  reInit: vi.fn(),
  scrollNext: vi.fn(),
  scrollPrev: vi.fn(),
  scrollTo: vi.fn(),
  on: vi.fn((event: string, callback: () => void) => carousel.listeners.set(event, callback)),
  off: vi.fn((event: string) => carousel.listeners.delete(event)),
  canScrollPrev: vi.fn(() => carousel.canPrev),
  canScrollNext: vi.fn(() => carousel.canNext),
  scrollSnapList: vi.fn(() => carousel.snaps),
  selectedScrollSnap: vi.fn(() => carousel.selected),
}));

vi.mock('embla-carousel-react', () => ({ default: () => [() => undefined, carousel] }));

import { StudyItemCarousel } from './StudyItemCarousel';

describe('StudyItemCarousel', () => {
  beforeEach(() => {
    carousel.snaps = [0, 1];
    carousel.selected = 0;
    carousel.canPrev = true;
    carousel.canNext = true;
    carousel.listeners.clear();
    vi.clearAllMocks();
  });

  it('renders no region for no items and omits arrows for one reachable snap', () => {
    const { rerender } = render(
      <StudyItemCarousel
        items={[]}
        id="empty"
        title="Continue Studying"
        itemLabel="subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
      />,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    carousel.snaps = [0];
    rerender(
      <StudyItemCarousel
        items={['only']}
        id="one"
        title="Continue Studying"
        itemLabel="subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
      />,
    );
    expect(screen.getByRole('region', { name: 'Continue Studying' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subject/ })).not.toBeInTheDocument();
    carousel.selected = 0;
    act(() => carousel.listeners.get('select')?.());
    rerender(
      <StudyItemCarousel
        items={[]}
        id="empty"
        title="Continue Studying"
        itemLabel="subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
      />,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(carousel.scrollTo).not.toHaveBeenCalledWith(-1, true);
  });

  it('scrolls one item per press and wraps manually when Embla disables loop', () => {
    render(
      <StudyItemCarousel
        items={['one', 'two', 'three']}
        id="active"
        title="Continue Studying"
        itemLabel="active subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
        layout="continueStudy"
        headingVisibility="srOnly"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(carousel.scrollNext).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Previous active subject' }));
    expect(carousel.scrollPrev).toHaveBeenCalledWith(false);

    carousel.canNext = false;
    fireEvent.click(screen.getByRole('button', { name: 'Next active subject' }));
    expect(carousel.scrollTo).toHaveBeenCalledWith(0, false);
    carousel.canPrev = false;
    fireEvent.click(screen.getByRole('button', { name: 'Previous active subject' }));
    expect(carousel.scrollTo).toHaveBeenLastCalledWith(1, false);
    expect(screen.getByRole('heading', { name: 'Continue Studying' })).toHaveStyle({ position: 'absolute' });
  });

  it('updates overflow controls after reInit and removes subscriptions on unmount', () => {
    const { unmount } = render(
      <StudyItemCarousel
        items={['one', 'two']}
        id="active"
        title="Continue Studying"
        itemLabel="subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
      />,
    );
    expect(screen.getByRole('button', { name: 'Next subject' })).toBeInTheDocument();
    carousel.snaps = [0];
    act(() => carousel.listeners.get('reInit')?.());
    expect(screen.queryByRole('button', { name: 'Next subject' })).not.toBeInTheDocument();
    unmount();
    expect(carousel.off).toHaveBeenCalledWith('select', expect.any(Function));
    expect(carousel.off).toHaveBeenCalledWith('reInit', expect.any(Function));
  });

  it('jumps to the next item when reduced motion is requested', () => {
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    render(
      <StudyItemCarousel
        items={['one', 'two']}
        id="active"
        title="Continue Studying"
        itemLabel="subject"
        itemKey={(x) => x}
        renderItem={(x) => x}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next subject' }));
    expect(carousel.scrollNext).toHaveBeenCalledWith(true);
  });
});
