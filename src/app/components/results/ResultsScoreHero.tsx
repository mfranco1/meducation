import { Box, Typography, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';

const animationDurationMs = 600;
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia(reducedMotionQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(reducedMotionQuery);
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
}

export function ResultsScoreHero({ percentage }: { percentage: number }) {
  const theme = useTheme();
  const target = Math.min(100, Math.max(0, percentage));
  const reducedMotion = useReducedMotionPreference();
  const [animatedScore, setAnimatedScore] = useState(() => reducedMotion ? target : 0);

  useEffect(() => {
    if (reducedMotion || target === 0) {
      setAnimatedScore(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / animationDurationMs));
      const easedProgress = 1 - (1 - progress) ** 3;
      setAnimatedScore(target * easedProgress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, target]);

  const displayedScore = Math.round(animatedScore);
  const dashOffset = animatedScore >= 100 ? 0 : 100 - animatedScore;
  const showArc = animatedScore > 0;

  return <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center' }}>
    <Box sx={{ position: 'relative', width: { xs: 200, sm: 220 }, aspectRatio: '1 / 1', display: 'grid', placeItems: 'center' }}>
      <svg aria-hidden="true" viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <circle data-testid="score-ring-track" cx="50" cy="50" r="47" fill="none" stroke={theme.palette.grey[300]} strokeWidth="4" pathLength="100" />
        {showArc && <circle
          data-testid="score-ring-arc"
          cx="50" cy="50" r="47" fill="none" stroke={theme.palette.primary.main} strokeWidth="4" strokeLinecap="butt"
          pathLength="100" strokeDasharray="100" strokeDashoffset={dashOffset}
          transform="rotate(-90 50 50)"
        />}
      </svg>
      <Box sx={{ position: 'relative', display: 'grid', justifyItems: 'center', width: '100%', boxSizing: 'border-box', px: 2 }}>
        <Typography component="h2" variant="overline" color="primary.main" fontWeight={800} sx={{ width: '100%', textAlign: 'center' }}>Quiz complete</Typography>
        <Typography aria-hidden="true" data-testid="score-percentage" variant="h2" sx={{ width: '100%', textAlign: 'center', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{displayedScore}%</Typography>
      </Box>
    </Box>
    <Box component="span" sx={{ border: 0, clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, margin: -1, overflow: 'hidden', padding: 0, position: 'absolute', whiteSpace: 'nowrap', width: 1 }}>
      Final score: {target}%.
    </Box>
  </Box>;
}
