import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useScrollCurrentQuestion(
  scrollAreaRef: RefObject<HTMLElement | null>,
  currentTileRef: RefObject<HTMLElement | null>,
  dependencies: readonly unknown[],
) {
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const currentTile = currentTileRef.current;
    if (!scrollArea || !currentTile) return;

    const frame = requestAnimationFrame(() => {
      const areaBounds = scrollArea.getBoundingClientRect();
      const tileBounds = currentTile.getBoundingClientRect();
      const tileCenter = tileBounds.top - areaBounds.top + tileBounds.height / 2;
      if (tileCenter >= scrollArea.clientHeight * .25 && tileCenter <= scrollArea.clientHeight * .75) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollArea.scrollTo({
        top: scrollArea.scrollTop + tileCenter - scrollArea.clientHeight / 2,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  // The caller supplies the exact navigation state that should trigger re-centering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
