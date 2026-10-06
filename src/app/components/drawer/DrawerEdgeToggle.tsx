import KeyboardArrowLeftRoundedIcon from '@mui/icons-material/KeyboardArrowLeftRounded';
import { Box, ButtonBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { learnerDrawerEdgeToggleOffset } from './drawerDimensions';

export interface DrawerEdgeToggleProps {
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  controlsId: string;
  expandLabel?: string;
  collapseLabel?: string;
  arrowOffset?: number;
}

export function DrawerEdgeToggle({
  expanded,
  onToggle,
  disabled = false,
  controlsId,
  expandLabel = 'Expand navigation',
  collapseLabel = 'Collapse navigation',
  arrowOffset = learnerDrawerEdgeToggleOffset,
}: DrawerEdgeToggleProps) {
  const theme = useTheme();
  const motion = theme.transitions.duration.short;
  return (
    <ButtonBase
      disableRipple
      disabled={disabled}
      aria-label={expanded ? collapseLabel : expandLabel}
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      data-testid="drawer-edge-toggle"
      sx={{
        position: 'absolute',
        zIndex: 2,
        insetBlock: 0,
      right: 0,
        width: 12,
        overflow: 'visible',
        cursor: disabled ? 'default' : 'pointer',
        bgcolor: 'transparent',
        '&:hover, &:active': { bgcolor: 'transparent' },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
        right: 0,
          width: 2,
          bgcolor: 'primary.main',
          opacity: 0,
          transition: `opacity ${motion}ms ease`,
        },
        '&:hover::before, &:focus-visible::before': { opacity: disabled ? 0 : 0.55 },
        '&:focus-visible': { outline: 'none' },
        '&:focus-visible .drawer-edge-toggle-arrow': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
          borderRadius: '50%',
        },
        '&:disabled': { pointerEvents: 'none' },
        '@media (prefers-reduced-motion: reduce)': {
          '&::before': { transition: 'none' },
          '& .drawer-edge-toggle-arrow': { transition: 'none' },
        },
      }}
    >
      <Box
        className="drawer-edge-toggle-arrow"
        aria-hidden="true"
        sx={{
          position: 'absolute',
          top: `${arrowOffset}px`,
        left: '100%',
          width: 28,
          height: 28,
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: '#eee5df',
          borderRadius: '50%',
          transform: `translate(-50%, -50%) rotate(${expanded ? 0 : 180}deg)`,
          transition: `transform ${motion}ms ease`,
          pointerEvents: 'none',
          '& svg': { fontSize: 19 },
        }}
      >
        <KeyboardArrowLeftRoundedIcon />
      </Box>
    </ButtonBase>
  );
}
