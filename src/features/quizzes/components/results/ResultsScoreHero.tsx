import { keyframes } from '@emotion/react';
import { alpha, Box, Typography, useTheme } from '@mui/material';
import { useEffect, useId, useRef, useState } from 'react';
import { easing, sizzle, useReducedMotion } from '../../../../shared/ui/motion';
import { Crackle } from '../../../../shared/ui/transitions/Crackle';
import { greenSparks } from '../celebration/RadiatingCircles';
import { RimBurst } from '../celebration/GoldBurst';
import { radius } from '../../../../shared/theme';

// Just outside the ring's outer edge (49%), alternating distances so they don't read as a dotted line.
const ringSparks = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * 2 * Math.PI;
  const radius = i % 2 ? 52 : 55;
  return [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)] as const;
});

const fastPhaseEnd = 0.65;
const scoreAtFastPhaseEnd = 0.85;
const initialVelocity = 1.4;
const joinVelocity = 0.7;

const settlePulse = keyframes`
  from { transform: scale(1); }
  40% { transform: scale(1.035); }
  to { transform: scale(1); }
`;
const goldWave = keyframes`
  0% { transform: scale(.92); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: scale(1.75); opacity: 0; }
`;
const settleEcho = keyframes`
  from { transform: scale(1); opacity: .4; }
  to { transform: scale(1.18); opacity: 0; }
`;
const goldFlash = keyframes`
  0% { filter: drop-shadow(0 0 0 rgba(255, 217, 90, 0)) drop-shadow(0 0 0 rgba(224, 165, 22, 0)) brightness(1); }
  22% { filter: drop-shadow(0 0 14px rgba(255, 217, 90, 1)) drop-shadow(0 0 34px rgba(224, 165, 22, .9)) brightness(1.3); }
  100% { filter: drop-shadow(0 0 8px rgba(255, 217, 90, 1)) drop-shadow(0 0 22px rgba(224, 165, 22, .55)) brightness(1); }
`;
const ripple = keyframes`
  from { opacity: .9; transform: scale(1); }
  to { opacity: 0; transform: scale(4.5); }
`;
const tick = keyframes`
  0% { transform: scale(1); }
  45% { transform: scale(1.04); }
  100% { transform: scale(1); }
`;
const numberShine = keyframes`
  0% { background-position: 100% 0; }
  100% { background-position: 0% 0; }
`;
const arcGlint = keyframes`
  0% { transform: rotate(-90deg); opacity: 0; }
  20%, 75% { opacity: 1; }
  100% { transform: rotate(calc(-90deg + var(--sweep))); opacity: 0; }
`;
const breath = keyframes`
  0% { opacity: 0; }
  25% { opacity: .55; }
  100% { opacity: 0; }
`;
const rays = keyframes`
  0% { opacity: 0; transform: rotate(0deg) scale(.9); }
  18% { opacity: .9; }
  100% { opacity: 0; transform: rotate(38deg) scale(1.05); }
`;

const rippleScores = [60, 75, 90];
const glintHead = 16;

/** A thin specular line along the stroke, tapering to nothing behind its head. */
function ArcGlint({ target, passes }: { target: number; passes: number }) {
  const dash = (length: number, width: number, opacity: number, cap: 'butt' | 'round') => (
    <circle
      key={length}
      cx="50"
      cy="50"
      r="47"
      fill="none"
      stroke="#fff"
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap={cap}
      pathLength="100"
      strokeDasharray={`${length} ${100 - length}`}
      strokeDashoffset={-(glintHead - length)}
    />
  );
  return (
    <Box
      component="g"
      aria-hidden
      sx={{
        '--sweep': `${(Math.max(target, glintHead) - glintHead) * 3.6}deg`,
        transformBox: 'view-box',
        transformOrigin: '50px 50px',
        animation: `${arcGlint} 900ms cubic-bezier(.4, 0, .2, 1) 120ms ${passes} both`,
      }}
    >
      {dash(16, 0.8, 0.22, 'butt')}
      {dash(10, 1.1, 0.3, 'butt')}
      {dash(5, 1.4, 0.45, 'butt')}
      {dash(1.5, 1.6, 0.95, 'round')}
    </Box>
  );
}

function hermite(start: number, end: number, startSlope: number, endSlope: number, progress: number) {
  const t2 = progress * progress;
  const t3 = t2 * progress;
  return (
    (2 * t3 - 3 * t2 + 1) * start +
    (t3 - 2 * t2 + progress) * startSlope +
    (-2 * t3 + 3 * t2) * end +
    (t3 - t2) * endSlope
  );
}

export function scoreAnimationProgress(progress: number) {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  if (boundedProgress <= 0) return 0;
  if (boundedProgress >= 1) return 1;
  if (boundedProgress <= fastPhaseEnd) {
    return hermite(
      0,
      scoreAtFastPhaseEnd,
      initialVelocity * fastPhaseEnd,
      joinVelocity * fastPhaseEnd,
      boundedProgress / fastPhaseEnd,
    );
  }
  const slowPhaseLength = 1 - fastPhaseEnd;
  return hermite(
    scoreAtFastPhaseEnd,
    1,
    joinVelocity * slowPhaseLength,
    0,
    (boundedProgress - fastPhaseEnd) / slowPhaseLength,
  );
}

export function scoreAnimationDuration(target: number) {
  return 600 + 600 * Math.sqrt(target / 100);
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function blendColors(from: string, to: string, progress: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const eased = progress * progress * (3 - 2 * progress);
  return `rgb(${start.map((channel, index) => Math.round(channel + (end[index] - channel) * eased)).join(', ')})`;
}

export function scoreRingColor(score: number, colors: { low: string; fair: string; good: string; high: string }) {
  const transitions = [
    { start: 58, end: 63, from: colors.low, to: colors.fair },
    { start: 73, end: 78, from: colors.fair, to: colors.good },
    { start: 88, end: 93, from: colors.good, to: colors.high },
  ];
  for (const transition of transitions) {
    if (score < transition.start) return transition.from;
    if (score <= transition.end)
      return blendColors(
        transition.from,
        transition.to,
        (score - transition.start) / (transition.end - transition.start),
      );
  }
  return colors.high;
}

export function ResultsScoreHero({
  percentage,
  perfect,
  onSettled,
  skip,
}: {
  percentage: number;
  perfect?: boolean;
  onSettled?: () => void;
  skip?: boolean;
}) {
  const theme = useTheme();
  const target = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  const reducedMotion = useReducedMotion();
  const [animatedScore, setAnimatedScore] = useState(() => (reducedMotion ? target : 0));
  const [settled, setSettled] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; color: string }[]>([]);
  const crossed = useRef(0);
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const scoreColors = theme.palette.scoreRing;
  const glowFilterId = useId().replace(/:/g, '');
  const goldId = useId().replace(/:/g, '');
  const duration = scoreAnimationDuration(target);

  useEffect(() => {
    if (skip && settledRef.current) return;
    settledRef.current = false;
    crossed.current = 0;
    setRipples([]);
    const settle = () => {
      settledRef.current = true;
      setSettled(true);
      onSettledRef.current?.();
    };
    setSettled(false);
    if (reducedMotion || skip) {
      setAnimatedScore(target);
      settle();
      return;
    }
    if (target === 0) {
      setAnimatedScore(0);
      const timer = setTimeout(settle, duration);
      return () => clearTimeout(timer);
    }

    let frame = 0;
    const startedAt = performance.now();
    const step = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / duration);
      const nextScore = progress >= 1 ? target : target * scoreAnimationProgress(progress);
      setAnimatedScore(nextScore);
      const passed = rippleScores.filter((threshold) => nextScore >= threshold).length;
      if (passed > crossed.current) {
        crossed.current = passed;
        const angle = (nextScore / 100) * 2 * Math.PI - Math.PI / 2;
        setRipples((current) => [
          ...current,
          {
            x: 50 + 47 * Math.cos(angle),
            y: 50 + 47 * Math.sin(angle),
            color: scoreRingColor(nextScore + 5, scoreColors),
          },
        ]);
      }
      if (progress < 1) frame = requestAnimationFrame(step);
      else settle();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, scoreColors, skip, target]);

  const displayedScore = animatedScore >= target ? target : Math.floor(animatedScore);
  const dashOffset = animatedScore >= 100 ? 0 : 100 - animatedScore;
  const showArc = animatedScore > 0;
  const gold = !!perfect && settled;
  const ringColor = gold ? `url(#${goldId})` : scoreRingColor(animatedScore, scoreColors);
  const glowColor = gold ? theme.palette.reward.main : scoreRingColor(animatedScore, scoreColors);
  const glowAngle = (animatedScore / 100) * 2 * Math.PI - Math.PI / 2;
  const glowX = 50 + 47 * Math.cos(glowAngle);
  const glowY = 50 + 47 * Math.sin(glowAngle);
  const growth = animatedScore / 100;
  const pulse = settled && !reducedMotion;
  const finalColor = scoreRingColor(target, scoreColors);
  const { reward } = theme.palette;

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
      <Typography component="h2" variant="overline" sx={{ color: 'text.secondary', mb: 1.75 }}>
        Quiz results
      </Typography>
      <Box
        sx={{
          position: 'relative',
          width: { xs: 200, sm: 220 },
          aspectRatio: '1 / 1',
          display: 'grid',
          placeItems: 'center',
          animation: pulse ? `${settlePulse} 600ms ${easing.out}` : undefined,
        }}
      >
        {pulse && gold && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '-55%',
              borderRadius: radius.circle,
              pointerEvents: 'none',
              background: `repeating-conic-gradient(from 0deg, ${alpha(reward.light, 0.42)} 0 5deg, transparent 5deg 17deg), repeating-conic-gradient(from 8deg, ${alpha(reward.main, 0.22)} 0 3deg, transparent 3deg 29deg)`,
              mask: 'radial-gradient(closest-side, transparent 46%, #000 52%, transparent 96%)',
              WebkitMask: 'radial-gradient(closest-side, transparent 46%, #000 52%, transparent 96%)',
              animation: `${rays} 2800ms ease-out both`,
            }}
          />
        )}
        {pulse &&
          target > 0 &&
          !gold &&
          [0, ...(target >= 90 ? [200] : [])].map((delay) => (
            <Box
              key={delay}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: radius.circle,
                boxShadow: `0 0 0 3px ${finalColor}`,
                pointerEvents: 'none',
                animation: `${settleEcho} 1000ms ease-out ${delay}ms both`,
              }}
            />
          ))}
        {pulse && !gold && target >= 90 && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '1%',
              borderRadius: radius.circle,
              boxShadow: `0 0 26px ${finalColor}, 0 0 8px ${finalColor}`,
              pointerEvents: 'none',
              animation: `${breath} 1500ms ease-out both`,
            }}
          />
        )}
        {pulse &&
          gold &&
          [
            { strength: 1, delay: 0, ms: 1400 },
            { strength: 0.55, delay: 220, ms: 1700 },
          ].map((wave) => (
            // Soft shockwave band that starts at the ring (72% of this oversized box) and radiates outward.
            <Box
              key={wave.delay}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: '-15%',
                borderRadius: radius.circle,
                background: `radial-gradient(closest-side, transparent 66%, ${alpha(reward.light, 0.9 * wave.strength)} 73%, ${alpha(reward.main, 0.35 * wave.strength)} 78%, transparent 88%)`,
                filter: 'blur(2px)',
                pointerEvents: 'none',
                animation: `${goldWave} ${wave.ms}ms ${easing.out} ${wave.delay}ms both`,
              }}
            />
          ))}
        {pulse && gold && <RimBurst count={144} travel={96} waves={2} />}
        {pulse && !gold && target >= 90 && <RimBurst count={40} travel={34} waves={1} colors={greenSparks} />}
        {pulse && gold && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: '2%',
              borderRadius: radius.circle,
              boxShadow: `0 0 18px ${reward.light}, 0 0 6px ${alpha(reward.main, 0.5)}`,
              pointerEvents: 'none',
              animation: `${sizzle} 800ms linear infinite`,
            }}
          />
        )}
        <Box
          component="svg"
          aria-hidden="true"
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          sx={{
            position: 'absolute',
            inset: 0,
            overflow: 'visible',
            filter: gold
              ? `drop-shadow(0 0 8px ${reward.light}) drop-shadow(0 0 22px ${alpha(reward.main, 0.55)})`
              : undefined,
            transition: reducedMotion ? undefined : 'filter 400ms ease-out',
            animation: pulse && gold ? `${goldFlash} 700ms ease-out both` : undefined,
          }}
        >
          <defs>
            <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={reward.light} />
              <stop offset=".45" stopColor={reward.main} />
              <stop offset=".6" stopColor={reward.light} />
              <stop offset="1" stopColor={reward.main} />
            </linearGradient>
          </defs>
          <circle
            data-testid="score-ring-track"
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke={theme.palette.grey[300]}
            strokeWidth="4"
            pathLength="100"
          />
          {showArc && (
            <circle
              data-testid="score-ring-arc"
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke={ringColor}
              strokeWidth="4"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
            />
          )}
          {showArc && !reducedMotion && (
            <g data-testid="score-ring-glow" style={{ opacity: settled ? 0 : 1, transition: 'opacity 350ms ease-out' }}>
              <defs>
                <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.6" />
                </filter>
              </defs>
              <circle
                cx={glowX}
                cy={glowY}
                r={3.6 + 3.4 * growth}
                fill={glowColor}
                opacity={0.5 + 0.35 * growth}
                filter={`url(#${glowFilterId})`}
              />
              <circle cx={glowX} cy={glowY} r={1.2 + 0.9 * growth} fill="#fff" opacity=".8" />
            </g>
          )}
          {ripples.map(({ x, y, color }, index) => (
            <Box
              key={index}
              component="circle"
              cx={x}
              cy={y}
              r="2.6"
              fill="none"
              stroke={color}
              strokeWidth=".9"
              sx={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `${ripple} 520ms ease-out both` }}
            />
          ))}
          {pulse && target >= 75 && <ArcGlint target={target} passes={gold ? 2 : 1} />}
        </Box>
        {gold && !reducedMotion && <Crackle points={ringSparks} size={3} travel={0.3} />}
        <Box
          sx={{
            position: 'relative',
            display: 'grid',
            justifyItems: 'center',
            width: '100%',
            boxSizing: 'border-box',
            px: 2,
          }}
        >
          <Typography
            key={ripples.length}
            aria-hidden="true"
            data-testid="score-percentage"
            variant="h2"
            sx={[
              {
                width: '100%',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              },
              ripples.length > 0 && { animation: `${tick} 200ms ${easing.out}` },
              pulse &&
                gold && {
                  color: 'transparent',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  backgroundImage: `linear-gradient(100deg, ${theme.palette.text.primary} 40%, ${reward.main} 47%, ${reward.light} 50%, ${reward.main} 53%, ${theme.palette.text.primary} 60%)`,
                  backgroundSize: '320% 100%',
                  backgroundPosition: '0% 0',
                  animation: `${numberShine} 1100ms ${easing.out} 250ms both`,
                },
            ]}
          >
            {displayedScore}%
          </Typography>
          <Typography
            aria-hidden="true"
            variant="overline"
            sx={{ color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Overall score
          </Typography>
        </Box>
      </Box>
      <Box
        component="span"
        sx={{
          border: 0,
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          height: 1,
          margin: -1,
          overflow: 'hidden',
          padding: 0,
          position: 'absolute',
          whiteSpace: 'nowrap',
          width: 1,
        }}
      >
        Final score: {target}%.
      </Box>
    </Box>
  );
}
