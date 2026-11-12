import { keyframes } from '@emotion/react';
import { alpha, Box, Stack, type Theme, Typography, useTheme } from '@mui/material';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { brand } from '../../../../shared/brand';
import { easing, sizzle, useReducedMotion } from '../../../../shared/ui/motion';
import { Crackle } from '../../../../shared/ui/transitions/Crackle';
import { type CelebrationLevel, GoldBurst, rnd } from './GoldBurst';
import { radius, shadowTint } from '../../../../shared/theme';

export type CelebrationVariant = 'streak' | 'perfect';

export interface CelebrationOverlayProps {
  open: boolean;
  title: string;
  message: string;
  variant: CelebrationVariant;
  level: CelebrationLevel;
  durationMs?: number;
  /** Centers horizontally within this element while staying at the viewport's vertical center. */
  horizontalAnchor?: HTMLElement | null;
  onComplete?: () => void;
}

const durations = [2500, 2500, 2600, 2900, 3200] as const;
const flameSizes = [46, 48, 50, 53, 56] as const;
const halos = [0.2, 0.34, 0.46, 0.6, 0.75] as const;
const washes = [0, 0, 0.1, 0.18, 0.26] as const;
const glows = [0, 0, 0.14, 0.24, 0.34] as const;
const glintStar = 'polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%)';

const enter = keyframes`
  0% { opacity: 0; transform: translateY(-10px) scale(.95); animation-timing-function: ${easing.out}; }
  20% { opacity: 1; transform: translateY(0) scale(1.02); animation-timing-function: ${easing.out}; }
  32%, 82% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-6px) scale(.98); }
`;
const reducedEnter = keyframes`
  0% { opacity: 0; }
  14%, 86% { opacity: 1; }
  100% { opacity: 0; }
`;
const ignite = keyframes`
  0% { transform: scale(.6); opacity: 0; }
  60% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;
const flicker = keyframes`
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.04); }
`;
const shine = keyframes`
  0% { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(480%) skewX(-20deg); }
`;
const returnShine = keyframes`
  0% { transform: translateX(480%) skewX(20deg); }
  100% { transform: translateX(-120%) skewX(20deg); }
`;
const halo = keyframes`
  0% { opacity: 0; transform: scale(.5); }
  100% { opacity: 1; transform: scale(1); }
`;
const comet = keyframes`
  0% { opacity: 0; transform: rotate(-90deg); }
  15%, 80% { opacity: 1; }
  100% { opacity: 0; transform: rotate(360deg); }
`;
const breathe = keyframes`
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
`;
const twinkle = keyframes`
  0% { opacity: 0; transform: scale(0) rotate(0); }
  40% { opacity: 1; transform: scale(1.15) rotate(45deg); }
  100% { opacity: 0; transform: scale(0) rotate(90deg); }
`;
const rise = keyframes`
  0% { opacity: 0; transform: translate(0, 0) scale(1); }
  18% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--sway), calc(var(--rise) * -1)) scale(.3); }
`;
const pipPop = keyframes`
  0% { transform: scale(0); }
  60% { transform: scale(1.5); }
  100% { transform: scale(1); }
`;
const pipRing = keyframes`
  0% { opacity: .9; transform: scale(1); }
  100% { opacity: 0; transform: scale(3.2); }
`;
const titleSizzle = keyframes`
  0%, 100% { text-shadow: 0 0 3px var(--sizzle); } 12% { text-shadow: 0 0 7px var(--sizzle); } 27% { text-shadow: 0 0 2px var(--sizzle); }
  45% { text-shadow: 0 0 8px var(--sizzle); } 61% { text-shadow: 0 0 4px var(--sizzle); } 80% { text-shadow: 0 0 6px var(--sizzle); }
`;
const borderSparks = [
  [8, 0],
  [23, 0],
  [41, 0],
  [58, 0],
  [76, 0],
  [92, 0],
  [14, 100],
  [33, 100],
  [52, 100],
  [70, 100],
  [88, 100],
  [0, 50],
  [100, 50],
] as const;
const titleSparks = [
  [4, 0],
  [30, 0],
  [62, 0],
  [92, 0],
  [100, 50],
  [18, 100],
  [78, 100],
] as const;

function Trophy({ animated }: { animated: boolean }) {
  const theme = useTheme();
  const id = useId();
  const { primary, reward } = theme.palette;
  const edge = alpha(primary.dark, 0.25);
  const leaves = [
    [18.5, 42.5, -60],
    [13.8, 39, -42],
    [10.6, 34, -26],
    [8.7, 28.3, -10],
    [8.2, 22.4, 6],
    [9, 16.6, 22],
  ] as const;
  const laurel = (
    <>
      <path d="M23 44.5C11 41 5.6 29 9.4 13" fill="none" stroke={reward.main} strokeWidth="1.2" strokeLinecap="round" />
      {leaves.map(([cx, cy, angle]) => (
        <ellipse
          key={cy}
          cx={cx - 1.6}
          cy={cy}
          rx="1.8"
          ry="3.7"
          transform={`rotate(${angle} ${cx - 1.6} ${cy})`}
          fill={`url(#${id})`}
          stroke={edge}
          strokeWidth=".3"
        />
      ))}
    </>
  );
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      width={56}
      height={56}
      style={{
        position: 'relative',
        display: 'block',
        overflow: 'visible',
        filter: `drop-shadow(0 2px 4px ${alpha(reward.main, 0.45)})`,
        animation: animated ? `${ignite} 520ms ${easing.out} both` : undefined,
      }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={reward.light} />
          <stop offset="1" stopColor={reward.main} />
        </linearGradient>
      </defs>
      {laurel}
      <g transform="translate(48 0) scale(-1 1)">{laurel}</g>
      <path
        d="M16.8 12.5H13C13 17.5 14.6 20 17.6 21M31.2 12.5H35C35 17.5 33.4 20 30.4 21"
        fill="none"
        stroke={reward.main}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16 10H32V16C32 22 28.5 26 24 26 19.5 26 16 22 16 16Z"
        fill={`url(#${id})`}
        stroke={edge}
        strokeWidth=".4"
      />
      <path
        d="M19.2 12.5V16C19.2 19 20.4 21.2 22.2 22.4"
        fill="none"
        stroke="#fff"
        strokeOpacity=".7"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M22.6 26H25.4V31H22.6Z" fill={reward.main} />
      <path d="M19 31H29V34H19Z" fill={`url(#${id})`} stroke={edge} strokeWidth=".4" />
      <path d="M17.5 34H30.5V36.5H17.5Z" fill={reward.main} stroke={edge} strokeWidth=".4" />
    </svg>
  );
}

function StreakFlame({ size, animated }: { size: number; animated: boolean }) {
  const theme = useTheme();
  const id = useId();
  const { primary, reward } = theme.palette;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{
        position: 'relative',
        display: 'block',
        overflow: 'visible',
        transformOrigin: '50% 100%',
        filter: `drop-shadow(0 2px 4px ${alpha(primary.main, 0.3)})`,
        animation: animated
          ? `${ignite} 520ms ${easing.out} both, ${flicker} 1.6s ease-in-out 520ms infinite`
          : undefined,
      }}
    >
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={primary.main} />
          <stop offset="1" stopColor={brand.palette.light.right} />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={reward.main} />
          <stop offset="1" stopColor={brand.palette.light.right} />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={reward.main} />
          <stop offset="1" stopColor={reward.light} />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5C12.6 5 18.2 7.6 18.2 13.6A6.2 6.2 0 0 1 5.8 13.6C5.8 11.4 6.8 9.8 8.2 8.4 8.4 10 9.2 11 10.3 11.3 10 7.2 10.6 4.2 12 1.5Z"
        fill={`url(#${id}o)`}
      />
      <path
        d="M12 8C12.4 10.4 16 11.8 16 15.2A4 4 0 0 1 8 15.2C8 13.8 8.6 12.9 9.5 12 9.7 12.9 10.2 13.4 10.9 13.6 10.7 11.2 11 9.6 12 8Z"
        fill={`url(#${id}m)`}
      />
      <path
        d="M12 13C12.3 14.4 14 15.1 14 16.8A2 2 0 0 1 10 16.8C10 16 10.4 15.5 10.9 15 11 15.5 11.3 15.8 11.6 15.9 11.5 14.6 11.6 13.8 12 13Z"
        fill={`url(#${id}i)`}
      />
    </svg>
  );
}

export function CelebrationOverlay(props: CelebrationOverlayProps) {
  return props.open ? <CelebrationPlayback {...props} /> : null;
}

function CelebrationPlayback({
  title,
  message,
  variant,
  level,
  durationMs = durations[level - 1],
  horizontalAnchor,
  onComplete,
}: CelebrationOverlayProps) {
  const reducedMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const completed = useRef(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!horizontalAnchor || !element) return;
    const align = () => {
      const { left, width } = horizontalAnchor.getBoundingClientRect();
      element.style.left = `${left + width / 2}px`;
      element.style.maxWidth = `${Math.min(width - 32, 390)}px`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(horizontalAnchor);
    window.addEventListener('resize', align);
    window.addEventListener('scroll', align, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', align);
      window.removeEventListener('scroll', align, true);
      element.style.removeProperty('left');
      element.style.removeProperty('max-width');
    };
  }, [horizontalAnchor]);
  useEffect(() => {
    // Prepare styles and layout before advancing any of the animation clocks.
    // The attribute starts playback without rerendering the particle tree.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (root.current) root.current.dataset.playing = 'true';
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const size = flameSizes[level - 1];
  const perfect = variant === 'perfect';
  const finale = level === 5 && !reducedMotion;
  return (
    <Box
      ref={root}
      data-playing="false"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      sx={{
        position: 'fixed',
        zIndex: (theme) => theme.zIndex.snackbar,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'max-content',
        maxWidth: 'min(calc(100% - 32px), 390px)',
        pointerEvents: 'none',
        '&[data-playing="false"]': {
          opacity: 0,
          '& *, & *::before, & *::after': { animationPlayState: 'paused !important' },
        },
      }}
    >
      <Box
        data-testid="celebration-card"
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget || root.current?.dataset.playing !== 'true' || completed.current)
            return;
          completed.current = true;
          onComplete?.();
        }}
        sx={{
          position: 'relative',
          border: '1px solid transparent',
          borderRadius: radius.card,
          pl: 2.5,
          pr: '28px',
          py: 2,
          background: ({ palette: { reward, divider, background, common } }) => {
            const edge = [
              `linear-gradient(${divider}, ${divider})`,
              `linear-gradient(${divider}, ${divider})`,
              `linear-gradient(135deg, color-mix(in srgb, ${reward.main} 55%, ${divider}), ${divider} 45%, color-mix(in srgb, ${reward.main} 55%, ${divider}))`,
              `linear-gradient(135deg, ${reward.light}, ${reward.main} 40%, ${reward.light} 60%, ${reward.main})`,
              `linear-gradient(135deg, ${reward.light}, ${reward.main} 30%, ${common.white} 50%, ${reward.main} 70%, ${reward.light})`,
            ][level - 1];
            return `radial-gradient(130% 150% at 0% 50%, ${alpha(reward.light, washes[level - 1])}, transparent 62%) padding-box, linear-gradient(${background.paper}, ${background.paper}) padding-box, ${edge} border-box`;
          },
          boxShadow: (t) =>
            `0 1px 2px ${shadowTint}.06), 0 8px 22px ${shadowTint}.09), 0 26px 56px ${shadowTint}.1), 0 0 34px ${alpha(t.palette.reward.main, glows[level - 1])}`,
          animation: `${reducedMotion ? reducedEnter : enter} ${durationMs}ms ease-in-out both`,
        }}
      >
        {level >= 3 && !reducedMotion && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: 'inherit',
              pointerEvents: 'none',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                top: '-10%',
                bottom: '-10%',
                left: 0,
                width: '26%',
                background: (t) =>
                  `linear-gradient(90deg, transparent, ${alpha(t.palette.reward.light, 0.22)} 30%, ${alpha(t.palette.common.white, 0.85)} 50%, ${alpha(t.palette.reward.light, 0.22)} 70%, transparent)`,
              },
              '&::after': { animation: `${shine} 950ms ${easing.out} 700ms both` },
              '&::before': perfect
                ? { animation: `${returnShine} 950ms ${easing.out} 1850ms both` }
                : { display: 'none' },
            }}
          />
        )}
        {finale && (
          <>
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                inset: -1,
                borderRadius: 'inherit',
                border: '1px solid',
                borderColor: 'reward.light',
                boxShadow: (t) =>
                  `0 0 14px ${t.palette.reward.light}, inset 0 0 6px ${alpha(t.palette.reward.light, 0.55)}`,
                pointerEvents: 'none',
                animation: perfect ? `${sizzle} 800ms linear infinite` : `${breathe} 1600ms ease-in-out infinite`,
              }}
            />
            {perfect && <Crackle points={borderSparks} size={4} />}
            <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {Array.from({ length: 9 }, (_, i) => (
                <Box
                  key={i}
                  component="span"
                  sx={{
                    position: 'absolute',
                    top: '-2px',
                    left: `${6 + i * 11 + Math.round(rnd(i, 11) * 5)}%`,
                    width: 3 + Math.round(rnd(i, 12) * 2),
                    height: 3 + Math.round(rnd(i, 12) * 2),
                    borderRadius: radius.circle,
                    background: (t) =>
                      `radial-gradient(circle, ${t.palette.common.white} 0, ${t.palette.reward.light} 40%, ${t.palette.reward.main})`,
                    boxShadow: (t) => `0 0 5px ${t.palette.reward.main}`,
                    '--rise': `${46 + Math.round(rnd(i, 13) * 44)}px`,
                    '--sway': `${Math.round((rnd(i, 14) - 0.5) * 28)}px`,
                    animation: `${rise} ${1100 + Math.round(rnd(i, 15) * 600)}ms ease-out ${520 + i * 150}ms both`,
                  }}
                />
              ))}
            </Box>
            {perfect &&
              [
                { sx: { right: 10, top: 0 }, delay: 1250 },
                { sx: { left: 10, top: '100%' }, delay: 2350 },
              ].map(({ sx, delay }) => (
                <Box
                  key={delay}
                  aria-hidden
                  component="span"
                  sx={{
                    position: 'absolute',
                    ...sx,
                    width: 14,
                    height: 14,
                    margin: '-7px',
                    background: (t) =>
                      `radial-gradient(circle, ${t.palette.common.white} 0 18%, ${t.palette.reward.light} 40%, ${t.palette.reward.main} 100%)`,
                    clipPath: glintStar,
                    filter: (t) => `drop-shadow(0 0 3px ${t.palette.reward.main})`,
                    pointerEvents: 'none',
                    animation: `${twinkle} 700ms ${easing.out} ${delay}ms both`,
                  }}
                />
              ))}
          </>
        )}
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <Box
            aria-hidden
            sx={{
              position: 'relative',
              display: 'grid',
              placeItems: 'center',
              width: 56,
              height: 56,
              flexShrink: 0,
              '& > .halo': {
                position: 'absolute',
                inset: '-10px',
                borderRadius: radius.circle,
                background: (t) =>
                  `radial-gradient(circle, ${alpha(t.palette.reward.light, halos[level - 1])} 0%, transparent 70%)`,
                animation: reducedMotion ? undefined : `${halo} 520ms ${easing.out} both`,
              },
              '& > .ring': {
                position: 'absolute',
                inset: '-5px',
                borderRadius: radius.circle,
                border: '1px solid',
                borderColor: (t: Theme) => alpha(t.palette.reward.main, 0.4),
                animation: `${halo} 520ms ${easing.out} both`,
              },
              '& > .comet': {
                position: 'absolute',
                inset: '-6px',
                borderRadius: radius.circle,
                background: (t: Theme) =>
                  `conic-gradient(from 0deg, transparent 0 55%, ${t.palette.reward.main} 78%, ${t.palette.common.white} 94%, transparent 100%)`,
                mask: 'radial-gradient(closest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
                WebkitMask: 'radial-gradient(closest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
                animation: `${comet} 1200ms ${easing.out} 200ms both`,
              },
            }}
          >
            <span className="halo" />
            {level >= 4 && !reducedMotion && (
              <>
                <span className="ring" />
                <span className="comet" />
              </>
            )}
            <GoldBurst level={level} durationMs={durationMs} />
            {perfect ? <Trophy animated={!reducedMotion} /> : <StreakFlame size={size} animated={!reducedMotion} />}
          </Box>
          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Box sx={{ position: 'relative', width: 'fit-content' }}>
              <Typography
                variant="h6"
                sx={[
                  {
                    color: 'primary.dark',
                  },
                  finale && {
                    '--sizzle': (t) => t.palette.reward.light,
                    animation: `${titleSizzle} 900ms linear infinite`,
                  },
                ]}
              >
                {title}
              </Typography>
              {finale && <Crackle points={titleSparks} size={3} />}
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {message}
            </Typography>
            {!perfect && (
              <Box aria-hidden data-testid="milestone-pips" sx={{ display: 'flex', gap: '5px', mt: '7px' }}>
                {[1, 2, 3, 4, 5].map((pip) => (
                  <Box
                    key={pip}
                    sx={{
                      position: 'relative',
                      width: 6,
                      height: 6,
                      borderRadius: radius.circle,
                      background: (t) =>
                        pip <= level
                          ? `linear-gradient(${t.palette.reward.light}, ${t.palette.reward.main})`
                          : `color-mix(in srgb, ${t.palette.reward.main} 22%, ${t.palette.divider})`,
                      ...(pip === level &&
                        !reducedMotion && {
                          animation: `${pipPop} 520ms ${easing.out} 520ms both`,
                          '&::after': {
                            content: '""',
                            position: 'absolute',
                            inset: '-1px',
                            borderRadius: radius.circle,
                            border: '1px solid',
                            borderColor: 'reward.main',
                            opacity: 0,
                            animation: `${pipRing} 800ms ${easing.out} 620ms both`,
                          },
                        }),
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
