import { keyframes } from '@emotion/react';
import { Box, useMediaQuery } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const durationMs = 260;
const easing = 'cubic-bezier(0.2, 0, 0, 1)';
const incoming = (direction: 'next' | 'previous') => keyframes`
  from { transform: translateX(${direction === 'next' ? '100%' : '-100%'}); }
  to { transform: translateX(0); }
`;
const outgoing = (direction: 'next' | 'previous') => keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(${direction === 'next' ? '-100%' : '100%'}); }
`;

export function CatalogPageTransition({
  children,
  previousPage,
  requestId,
  resetKey,
  direction,
}: {
  children: ReactNode;
  previousPage?: ReactNode;
  requestId: number;
  resetKey: string;
  direction: 'next' | 'previous';
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [activeRequest, setActiveRequest] = useState<number | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState<number | undefined>();
  const hasPreviousPage = Boolean(previousPage);

  useEffect(() => {
    if (!requestId || reducedMotion || !hasPreviousPage) {
      setActiveRequest(null);
      return;
    }
    setActiveRequest(requestId);
  }, [requestId, resetKey, reducedMotion, hasPreviousPage]);

  useLayoutEffect(() => {
    if (!activeRequest || activeRequest !== requestId || !hasPreviousPage || reducedMotion) {
      setReservedHeight(undefined);
      return;
    }
    const currentHeight = currentRef.current?.getBoundingClientRect().height ?? 0;
    const previousHeight = previousRef.current?.getBoundingClientRect().height ?? 0;
    setReservedHeight(Math.max(currentHeight, previousHeight) || undefined);
  }, [activeRequest, hasPreviousPage, reducedMotion, requestId]);

  useEffect(() => {
    if (!activeRequest || activeRequest !== requestId) return;
    const timer = window.setTimeout(
      () => setActiveRequest((active) => (active === requestId ? null : active)),
      durationMs + 80,
    );
    return () => window.clearTimeout(timer);
  }, [activeRequest, requestId]);

  useEffect(() => {
    if (!activeRequest) return;
    const settle = () => setActiveRequest(null);
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [activeRequest]);

  const animating = Boolean(activeRequest && activeRequest === requestId && previousPage && !reducedMotion);
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: animating ? 'hidden' : 'visible',
        px: 1,
        mx: -1,
        height: animating ? reservedHeight : undefined,
      }}
    >
      {animating && (
        <Box
          ref={previousRef}
          aria-hidden="true"
          inert
          sx={{
            position: 'absolute',
            inset: '0 4px auto',
            pointerEvents: 'none',
            animation: `${outgoing(direction)} ${durationMs}ms ${easing} both`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {previousPage}
        </Box>
      )}
      <Box
        ref={currentRef}
        sx={{
          position: animating ? 'absolute' : 'relative',
          inset: animating ? '0 4px auto' : undefined,
          width: animating ? 'calc(100% - 8px)' : undefined,
          animation: animating ? `${incoming(direction)} ${durationMs}ms ${easing} both` : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
