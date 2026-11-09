import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useEffect, useRef, type Ref } from 'react';
import { alpha } from '@mui/material/styles';
import { radius } from '../../theme';
import { easing, reducedMotion } from '../motion';

export type SubjectFilter = 'all' | 'inProgress';

export function SubjectFilterPill({
  value,
  onChange,
  disabled = false,
  allButtonRef,
}: {
  value: SubjectFilter;
  onChange: (value: SubjectFilter) => void;
  disabled?: boolean;
  allButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      aria-label="Filter subjects"
      onChange={(_, nextValue: SubjectFilter | null) => nextValue && onChange(nextValue)}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        position: 'relative',
        borderRadius: radius.pill,
        bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05),
        p: '2px',
        // The active blob slides between the two equal-width segments.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: 2,
          width: 'calc(50% - 2px)',
          borderRadius: radius.pill,
          bgcolor: 'primary.light',
          transform: value === 'inProgress' ? 'translateX(100%)' : 'none',
          transition: `transform 240ms ${easing.standard}`,
          [reducedMotion]: { transition: 'none' },
        },
        '& .MuiToggleButtonGroup-grouped': {
          position: 'relative',
          border: 0,
          borderRadius: radius.pill,
          height: 26,
          padding: '0 12px',
          fontSize: (theme) => theme.typography.caption.fontSize,
          lineHeight: 1.2,
          color: 'text.secondary',
          transition: `color 180ms ${easing.standard}`,
          '&:not(:first-of-type)': { borderLeft: 0, ml: 0 },
          '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'transparent', color: 'primary.dark' },
          '&:hover': { bgcolor: 'transparent', color: 'text.primary' },
        },
      }}
    >
      {(
        [
          ['all', 'All'],
          ['inProgress', 'In progress'],
        ] as const
      ).map(([filter, label]) => (
        <ToggleButton key={filter} value={filter} disabled={disabled} ref={filter === 'all' ? allButtonRef : undefined}>
          {label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export function SubjectPagination({
  page,
  pageCount,
  onChange,
  disabled = false,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const safePage = Math.max(1, Math.min(page, pageCount));
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const boundaryFocusRef = useRef(false);
  useEffect(() => {
    if (boundaryFocusRef.current && (safePage === 1 || safePage === pageCount)) {
      summaryRef.current?.focus();
      boundaryFocusRef.current = false;
    }
  }, [pageCount, safePage]);
  const changePage = (nextPage: number) => {
    boundaryFocusRef.current = nextPage === 1 || nextPage === pageCount;
    onChange(nextPage);
  };
  if (pageCount <= 1) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mt: 2.5 }}>
      <Button
        startIcon={<ArrowBackRoundedIcon />}
        disabled={disabled || safePage <= 1}
        onClick={() => changePage(safePage - 1)}
      >
        Previous
      </Button>
      <Typography
        ref={summaryRef}
        tabIndex={-1}
        aria-live="polite"
        variant="body2"
        sx={{
          color: 'text.secondary',
          minWidth: 84,
          textAlign: 'center',
        }}
      >
        Page {safePage} of {pageCount}
      </Typography>
      <Button
        endIcon={<ArrowForwardRoundedIcon />}
        disabled={disabled || safePage >= pageCount}
        onClick={() => changePage(safePage + 1)}
      >
        Next
      </Button>
    </Box>
  );
}
