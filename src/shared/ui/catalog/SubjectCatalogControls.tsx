import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useEffect, useRef, type Ref } from 'react';

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
        borderRadius: 99,
        bgcolor: 'rgba(185, 81, 27, .08)',
        p: 0,
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: 99,
          px: 2.5,
          minWidth: 108,
          minHeight: 32,
          height: 32,
          padding: '0 18px',
          lineHeight: 1.2,
          textTransform: 'none',
          fontWeight: 700,
          fontSize: '0.875rem',
          color: 'text.secondary',
          '&:not(:first-of-type)': { borderLeft: 0, ml: 0 },
          '&.Mui-selected': {
            bgcolor: 'primary.main',
            color: 'common.white',
            '&:hover': { bgcolor: 'primary.main' },
          },
          '&:hover': { bgcolor: 'transparent' },
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
        color="text.secondary"
        sx={{
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
