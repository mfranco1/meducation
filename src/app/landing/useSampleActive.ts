import { useEffect, useState, type RefObject } from 'react';

/** The section covering the viewport's midpoint owns the sample shortcuts. */
export function useSampleActive(region: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const midpoint = window.innerHeight / 2;
      setActive(bounds.top <= midpoint && bounds.bottom > midpoint);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [region]);

  return active;
}
