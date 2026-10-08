import { useLayoutEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';

const SMALL = '(max-width: 599.95px)';

function useFaceSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0, small: false });

  useLayoutEffect(() => {
    if (!element) return;
    const media = window.matchMedia(SMALL);
    const updateSize = (width: number, height: number) => {
      setSize((current) =>
        current.width === width && current.height === height && current.small === media.matches
          ? current
          : { width, height, small: media.matches },
      );
    };
    updateSize(element.offsetWidth, element.offsetHeight);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const entry = entries[0];
            const borderBox = entry?.borderBoxSize?.[0];
            if (entry)
              updateSize(
                borderBox?.inlineSize ?? entry.contentRect.width,
                borderBox?.blockSize ?? entry.contentRect.height,
              );
          });
    observer?.observe(element);
    const updateBreakpoint = () => updateSize(element.offsetWidth, element.offsetHeight);
    media.addEventListener('change', updateBreakpoint);
    return () => {
      observer?.disconnect();
      media.removeEventListener('change', updateBreakpoint);
    };
  }, [element]);

  return size;
}

function framePath(left: number, top: number, right: number, bottom: number, radius: number) {
  return `M ${left + radius} ${top} H ${right - radius} A ${radius} ${radius} 0 0 0 ${right} ${top + radius} V ${bottom - radius} A ${radius} ${radius} 0 0 0 ${right - radius} ${bottom} H ${left + radius} A ${radius} ${radius} 0 0 0 ${left} ${bottom - radius} V ${top + radius} A ${radius} ${radius} 0 0 0 ${left + radius} ${top} Z`;
}

export function FlashcardFaceDecoration({ element }: { element: HTMLElement | null }) {
  const { width, height, small } = useFaceSize(element);
  const theme = useTheme();
  const margin = small ? 12 : 16;
  const radius = Math.min(small ? 18 : 26, Math.max(4, Math.min(width, height) / 2 - margin));
  const bounds = { left: margin, top: margin, right: width - margin, bottom: height - margin };
  const centerX = width / 2;
  const centerY = height / 2;
  const insetScale = (inset: number) => Math.max(0, (Math.min(width, height) - 2 * inset) / Math.min(width, height));
  const centeredScale = (scale: number) =>
    `translate(${centerX} ${centerY}) scale(${scale}) translate(${-centerX} ${-centerY})`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid="flashcard-frame-decoration"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    >
      <path
        d={framePath(bounds.left, bounds.top, bounds.right, bounds.bottom, radius)}
        fill={theme.palette.primary.main}
      />
      <path
        d={framePath(bounds.left, bounds.top, bounds.right, bounds.bottom, radius)}
        fill="none"
        stroke={theme.palette.background.paper}
        strokeOpacity="0.9"
        strokeWidth="1"
        transform={centeredScale(insetScale(4.5))}
      />
      <path
        d={framePath(bounds.left, bounds.top, bounds.right, bounds.bottom, radius)}
        fill="none"
        stroke={theme.palette.background.paper}
        strokeOpacity="0.9"
        strokeWidth="1"
        transform={centeredScale(insetScale(7.5))}
      />
    </svg>
  );
}
