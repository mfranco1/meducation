import { keyframes } from '@emotion/react';
import { alpha, Box, Typography, useTheme } from '@mui/material';
import { useEffect, useId, useRef, useState } from 'react';
import { easing, useReducedMotion } from '../../../../shared/ui/motion';
import { Crackle, GoldBurst, sizzle } from '../celebration/GoldBurst';

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

export function ResultsScoreHero({ percentage, perfect, onSettled, skip }: { percentage: number; perfect?: boolean; onSettled?: () => void; skip?: boolean }) {
  const theme = useTheme();
  const target = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  const reducedMotion = useReducedMotion();
  const [animatedScore, setAnimatedScore] = useState(() => (reducedMotion ? target : 0));
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const glowFilterId = useId().replace(/:/g, '');
  const duration = scoreAnimationDuration(target);

  useEffect(() => {
    if (skip && settledRef.current) return;
    settledRef.current = false;
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
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / duration);
      const nextScore = progress >= 1 ? target : target * scoreAnimationProgress(progress);
      setAnimatedScore(nextScore);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else settle();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, skip, target]);

  const displayedScore = animatedScore >= target ? target : Math.floor(animatedScore);
  const dashOffset = animatedScore >= 100 ? 0 : 100 - animatedScore;
  const showArc = animatedScore > 0;
  const gold = perfect && settled;
  const ringColor = gold ? theme.palette.reward.main : scoreRingColor(animatedScore, theme.palette.scoreRing);
  const glowAngle = (animatedScore / 100) * 2 * Math.PI - Math.PI / 2;
  const glowX = 50 + 47 * Math.cos(glowAngle);
  const glowY = 50 + 47 * Math.sin(glowAngle);
  const pulse = settled && !reducedMotion;

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
      <Typography component="h2" variant="overline" color="text.secondary" fontWeight={700} letterSpacing=".12em">
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
        {pulse && target > 0 && !gold && (
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              boxShadow: `0 0 0 3px ${scoreRingColor(target, theme.palette.scoreRing)}`,
              pointerEvents: 'none',
              animation: `${settleEcho} 1000ms ease-out both`,
            }}
          />
        )}
        {pulse && gold && [{ strength: 1, delay: 0, ms: 1400 }, { strength: .55, delay: 220, ms: 1700 }].map(wave => (
          // Soft shockwave band that starts at the ring (72% of this oversized box) and radiates outward.
          <Box
            key={wave.delay}
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: '-15%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, transparent 66%, ${alpha(theme.palette.reward.light, .9 * wave.strength)} 73%, ${alpha(theme.palette.reward.main, .35 * wave.strength)} 78%, transparent 88%)`,
              filter: 'blur(2px)',
              pointerEvents: 'none',
              animation: `${goldWave} ${wave.ms}ms ${easing.out} ${wave.delay}ms both`,
            }}
          />
        ))}
        {gold && <GoldBurst level={5} durationMs={3200} scale={1.6} sparksOnly />}
        {gold && !reducedMotion && <>
          <Box aria-hidden sx={{ position: 'absolute', inset: '2%', borderRadius: '50%', boxShadow: `0 0 18px ${theme.palette.reward.light}, 0 0 6px ${alpha(theme.palette.reward.main, .5)}`, pointerEvents: 'none', animation: `${sizzle} 800ms linear infinite` }} />
        </>}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: gold ? `drop-shadow(0 0 8px ${theme.palette.reward.light}) drop-shadow(0 0 22px ${alpha(theme.palette.reward.main, .55)})` : undefined, transition: reducedMotion ? undefined : 'filter 400ms ease-out' }}
        >
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
              <circle cx={glowX} cy={glowY} r="4.5" fill={ringColor} opacity=".55" filter={`url(#${glowFilterId})`} />
              <circle cx={glowX} cy={glowY} r="1.4" fill="#fff" opacity=".8" />
            </g>
          )}
        </svg>
        {gold && !reducedMotion && <Crackle points={ringSparks} size={3} travel={.3} />}
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
            aria-hidden="true"
            data-testid="score-percentage"
            variant="h2"
            sx={{
              width: '100%',
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}
          >
            {displayedScore}%
          </Typography>
          <Typography
            aria-hidden="true"
            variant="overline"
            color="text.secondary"
            sx={{ lineHeight: 1.2, textTransform: 'uppercase' }}
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
