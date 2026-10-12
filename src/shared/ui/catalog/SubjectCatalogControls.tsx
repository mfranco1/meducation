import { Box, Button, ButtonGroup, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useEffect, useRef } from 'react';

export type SubjectFilter = 'all' | 'inProgress';

export function SubjectFilterPill({
  value,
  onChange,
  disabled = false,
}: {
  value: SubjectFilter;
  onChange: (value: SubjectFilter) => void;
  disabled?: boolean;
}) {
  return (
    <ButtonGroup
      aria-label="Filter subjects"
      role="group"
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 99,
        overflow: 'hidden',
        '& .MuiButton-root': {
          border: 0,
          borderRadius: 99,
          px: 1.5,
          minHeight: 36,
          textTransform: 'none',
          fontWeight: 700,
        },
      }}
    >
      {(
        [
          ['all', 'All'],
          ['inProgress', 'In progress'],
        ] as const
      ).map(([filter, label]) => (
        <Button
          key={filter}
          disabled={disabled}
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
          sx={{
            color: value === filter ? 'primary.dark' : 'text.secondary',
            bgcolor: value === filter ? 'primary.light' : 'background.paper',
            '&:hover': { bgcolor: value === filter ? 'primary.light' : 'action.hover' },
          }}
        >
          {label}
        </Button>
      ))}
    </ButtonGroup>
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
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mt: 2.5 }}>
      <Button
        variant="outlined"
        startIcon={<ArrowBackRoundedIcon />}
        disabled={disabled || safePage <= 1}
        onClick={() => changePage(safePage - 1)}
        sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}
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
          '&:focus': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3, borderRadius: 1 },
        }}
      >
        Page {safePage} of {pageCount}
      </Typography>
      <Button
        variant="outlined"
        endIcon={<ArrowForwardRoundedIcon />}
        disabled={disabled || safePage >= pageCount}
        onClick={() => changePage(safePage + 1)}
        sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 700 }}
      >
        Next
      </Button>
    </Box>
  );
}
