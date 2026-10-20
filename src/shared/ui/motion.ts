import { keyframes } from '@emotion/react';
import { useEffect, useState } from 'react';

export const easing = { standard: 'cubic-bezier(0.2, 0, 0, 1)', out: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const;

/** sx media key for reduced-motion overrides. */
export const reducedMotion = '@media (prefers-reduced-motion: reduce)';

/** Irregular flicker for sizzling gold glows. */
export const sizzle = keyframes`
  0%, 100% { opacity: .55; } 7% { opacity: 1; } 13% { opacity: .7; } 21% { opacity: .95; } 34% { opacity: .6; }
  41% { opacity: 1; } 55% { opacity: .75; } 63% { opacity: 1; } 78% { opacity: .65; } 86% { opacity: .95; }
`;

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
