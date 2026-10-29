import { useEffect, useState, type RefObject } from 'react';

/**
 * A landing sample takes the study shortcuts only after the visitor clicks or focuses inside it,
 * until they click or focus elsewhere or scroll it out of view. Focus lost to the page body
 * (a choice locking, a card face swapping) keeps it active.
 */
export function useSampleActive(region: RefObject<HTMLElement | null>) {
  const [engaged, setEngaged] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const engage = (event: Event) => setEngaged(event.target instanceof Node && element.contains(event.target));
    document.addEventListener('pointerdown', engage);
    document.addEventListener('focusin', engage);
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    observer.observe(element);
    return () => {
      document.removeEventListener('pointerdown', engage);
      document.removeEventListener('focusin', engage);
      observer.disconnect();
    };
  }, [region]);

  return engaged && visible;
}
