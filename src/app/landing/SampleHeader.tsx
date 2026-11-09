import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/** Reserve room for every detail option so navigating samples never changes the header layout. */
export function SampleHeader({
  id,
  title,
  detail,
  detailOptions,
  navLabel,
  children,
}: {
  id: string;
  title: string;
  detail: string;
  detailOptions?: string[];
  navLabel: string;
  children: ReactNode[];
}) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        columnGap: 2,
        rowGap: 1.5,
        mb: 1.5,
      }}
    >
      <Box sx={{ minWidth: 0, maxWidth: '100%', width: detailOptions ? 'max-content' : undefined }}>
        <Typography id={id} component="h2" variant="subtitle2" sx={{ color: 'text.primary' }}>
          {title}
        </Typography>
        <Typography component="div" variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'grid' }}>
          {(detailOptions ?? [detail]).map((option) => (
            <Box
              component="span"
              key={option}
              aria-hidden={option !== detail ? true : undefined}
              sx={{ gridArea: '1 / 1', visibility: option === detail ? 'visible' : 'hidden' }}
            >
              {option}
            </Box>
          ))}
        </Typography>
      </Box>
      <Box
        component="nav"
        aria-label={navLabel}
        sx={{ display: 'grid', gridTemplateColumns: `repeat(${children.length}, 44px)`, gap: 1, flexShrink: 0 }}
      >
        {children}
      </Box>
    </Stack>
  );
}
