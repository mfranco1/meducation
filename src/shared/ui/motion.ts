import { useEffect, useState } from 'react';

export const easing = { standard: 'cubic-bezier(0.2, 0, 0, 1)', out: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const;

/** sx media key for reduced-motion overrides. */
export const reducedMotion = '@media (prefers-reduced-motion: reduce)';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
}
