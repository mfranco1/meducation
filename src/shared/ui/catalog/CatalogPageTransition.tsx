import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { easing, reducedMotion, useReducedMotion } from '../motion';

const durationMs = 260;
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
  const reduced = useReducedMotion();
  const [activeRequest, setActiveRequest] = useState<number | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState<number | undefined>();
  const hasPreviousPage = Boolean(previousPage);

  useEffect(() => {
    if (!requestId || reduced || !hasPreviousPage) {
      setActiveRequest(null);
      return;
    }
    setActiveRequest(requestId);
  }, [requestId, resetKey, reduced, hasPreviousPage]);

  useLayoutEffect(() => {
    if (!activeRequest || activeRequest !== requestId || !hasPreviousPage || reduced) {
      setReservedHeight(undefined);
      return;
    }
    const currentHeight = currentRef.current?.getBoundingClientRect().height ?? 0;
    const previousHeight = previousRef.current?.getBoundingClientRect().height ?? 0;
    setReservedHeight(Math.max(currentHeight, previousHeight) || undefined);
  }, [activeRequest, hasPreviousPage, reduced, requestId]);

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

  const animating = Boolean(activeRequest && activeRequest === requestId && previousPage && !reduced);
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
            animation: `${outgoing(direction)} ${durationMs}ms ${easing.standard} both`,
            [reducedMotion]: { animation: 'none' },
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
          animation: animating ? `${incoming(direction)} ${durationMs}ms ${easing.standard} both` : 'none',
          [reducedMotion]: { animation: 'none' },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
