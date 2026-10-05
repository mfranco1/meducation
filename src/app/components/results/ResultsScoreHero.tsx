import { Box, Typography, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const fastPhaseEnd = 0.65;
const scoreAtFastPhaseEnd = 0.85;
const initialVelocity = 1.4;
const joinVelocity = 0.7;

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(reducedMotionQuery).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(reducedMotionQuery);
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
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
  return 450 + 850 * Math.sqrt(target / 100);
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

export function ResultsScoreHero({ percentage }: { percentage: number }) {
  const theme = useTheme();
  const target = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  const reducedMotion = useReducedMotionPreference();
  const [animatedScore, setAnimatedScore] = useState(() => (reducedMotion ? target : 0));
  const duration = scoreAnimationDuration(target);

  useEffect(() => {
    if (reducedMotion || target === 0) {
      setAnimatedScore(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / duration);
      const nextScore = progress >= 1 ? target : target * scoreAnimationProgress(progress);
      setAnimatedScore(nextScore);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reducedMotion, target]);

  const displayedScore = animatedScore >= target ? target : Math.floor(animatedScore);
  const dashOffset = animatedScore >= 100 ? 0 : 100 - animatedScore;
  const showArc = animatedScore > 0;
  const ringColor = scoreRingColor(animatedScore, theme.palette.scoreRing);

  return (
    <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
      <Box
        sx={{
          position: 'relative',
          width: { xs: 200, sm: 220 },
          aspectRatio: '1 / 1',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0 }}
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
              strokeLinecap="butt"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
            />
          )}
        </svg>
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
            component="h2"
            variant="overline"
            color="primary.main"
            fontWeight={800}
            sx={{ width: '100%', textAlign: 'center' }}
          >
            Quiz complete
          </Typography>
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
