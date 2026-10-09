import { useLayoutEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';

const SMALL = '(max-width: 599.95px)';

function useFaceSize(element: HTMLElement | null) {
  const [size, setSize] = useState({
    width: 0,
    height: 0,
    small: false,
    frameRadius: 0,
    frameMargin: 0,
    lineInset: 0,
  });

  useLayoutEffect(() => {
    if (!element) return;
    const media = window.matchMedia(SMALL);
    const updateSize = (width: number, height: number) => {
      const styles = window.getComputedStyle(element);
      const frameRadius = Number.parseFloat(styles.getPropertyValue('--flashcard-frame-radius')) || 0;
      const frameMargin = Number.parseFloat(styles.getPropertyValue('--flashcard-frame-margin')) || 0;
      const lineInset = frameMargin * 0.28125;
      setSize((current) =>
        current.width === width &&
        current.height === height &&
        current.small === media.matches &&
        current.frameRadius === frameRadius &&
        current.frameMargin === frameMargin &&
        current.lineInset === lineInset
          ? current
          : { width, height, small: media.matches, frameRadius, frameMargin, lineInset },
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

function framePath(left: number, top: number, right: number, bottom: number, radius: number, inset = 0) {
  // Concave cutouts are centered on the original bounds' corners. Intersect
  // their enlarged circles with the inset straight edges to preserve the gap.
  const reach = Math.sqrt(Math.max(0, radius * radius - inset * inset));
  return `M ${left + reach} ${top + inset} H ${right - reach} A ${radius} ${radius} 0 0 0 ${right - inset} ${top + reach} V ${bottom - reach} A ${radius} ${radius} 0 0 0 ${right - reach} ${bottom - inset} H ${left + reach} A ${radius} ${radius} 0 0 0 ${left + inset} ${bottom - reach} V ${top + reach} A ${radius} ${radius} 0 0 0 ${left + reach} ${top + inset} Z`;
}

export function FlashcardFaceDecoration({ element }: { element: HTMLElement | null }) {
  const { width, height, small, frameRadius, frameMargin, lineInset } = useFaceSize(element);
  const theme = useTheme();
  const margin = frameMargin || (small ? 12 : 16);
  const radius = frameRadius || (small ? 18 : 26);
  const bounds = { left: margin, top: margin, right: width - margin, bottom: height - margin };

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
        d={framePath(bounds.left, bounds.top, bounds.right, bounds.bottom, radius + lineInset, lineInset)}
        fill="none"
        stroke={theme.palette.common.white}
        strokeOpacity="0.95"
        strokeWidth="1.5"
      />
    </svg>
  );
}
