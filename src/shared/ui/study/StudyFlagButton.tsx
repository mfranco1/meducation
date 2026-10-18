import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { keyframes } from '@emotion/react';
import { Box, IconButton, type SxProps, type Theme } from '@mui/material';
import { useState } from 'react';

export const flagFlutter = keyframes`
  from { transform: none; }
  20% { transform: rotate(-14deg) skewY(6deg); }
  40% { transform: rotate(9deg) skewY(-4deg); }
  60% { transform: rotate(-5deg) skewY(2deg); }
  80% { transform: rotate(2deg); }
  to { transform: none; }
`;

/** Flag toggle that flutters when the user flags the item (not when an already-flagged item is shown). */
export function StudyFlagButton({ flagged, label, onToggle, size, sx }: { flagged: boolean; label: string; onToggle: () => void; size?: 'small'; sx?: SxProps<Theme> }) {
  const [fluttering, setFluttering] = useState(false);
  return <IconButton
    size={size}
    disableRipple
    aria-label={label}
    aria-pressed={flagged}
    onClick={() => {
      setFluttering(!flagged);
      onToggle();
    }}
    sx={[{ bgcolor: 'transparent', '&:hover': { bgcolor: 'transparent' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }, ...(Array.isArray(sx) ? sx : [sx])]}
  >
    <Box component="span" onAnimationEnd={() => setFluttering(false)} sx={{ display: 'inline-flex', transformOrigin: '20% 90%', animation: fluttering ? `${flagFlutter} 550ms ease-out` : undefined, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
      {flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}
    </Box>
  </IconButton>;
}
