import { lighten } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';

const countFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, useGrouping: false });

// Truncates counts of 1000 or more to whole thousands (999,999 -> "999k").
export function formatStatCount(value: number) {
  return value >= 1000 ? `${Math.floor(value / 1000)}k` : countFormatter.format(value);
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  badge?: string;
  variant?: 'dashboard' | 'results';
  footer?: ReactNode;
  icon?: ReactNode;
  supportingText?: ReactNode;
  accessibleLabel?: string;
  sx?: SxProps<Theme>;
  supportingTextSx?: SxProps<Theme>;
}

export function StatCard({
  label,
  value,
  badge,
  variant = 'dashboard',
  footer,
  icon,
  supportingText,
  accessibleLabel = label,
  sx,
  supportingTextSx,
}: StatCardProps) {
  const dashboard = variant === 'dashboard';
  return (
    <Card
      role="group"
      aria-label={accessibleLabel}
      sx={[
        {
          flex: 1,
          minWidth: 0,
          ...(dashboard && {
            minHeight: { xs: 104, sm: 108 },
            borderRadius: 1,
            borderColor: '#f0e6df',
            backgroundColor: (theme) => lighten(theme.palette.primary.light, 0.38),
            boxShadow: '0 3px 14px rgba(70, 38, 20, .045)',
          }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <CardContent
        sx={[
          {
            ...(dashboard && {
              p: { xs: 2, sm: 2.25 },
              '&:last-child': { pb: { xs: 2, sm: 2.25 } },
            }),
          },
        ]}
      >
        <Stack
          alignItems="center"
          direction="row"
          spacing={dashboard ? 1.5 : 0.75}
          sx={{ flexWrap: 'wrap', rowGap: 0.5 }}
        >
          {icon && dashboard && (
            <Box aria-hidden="true" sx={{ display: 'inline-flex', color: 'primary.main', fontSize: 24 }}>
              {icon}
            </Box>
          )}
          <Typography
            color={dashboard ? 'text.primary' : 'text.secondary'}
            variant="body2"
            sx={dashboard ? { fontWeight: 650 } : undefined}
          >
            {label}
          </Typography>
          {badge && <Chip label={badge} size="small" sx={{ height: 20, '& .MuiChip-label': { px: 0.75 } }} />}
        </Stack>
        <Typography
          variant={dashboard ? 'h4' : 'h5'}
          sx={
            dashboard
              ? {
                  mt: 1.25,
                  minHeight: 32,
                  fontSize: { xs: '1.625rem', sm: '1.75rem' },
                  lineHeight: 1.1,
                  fontWeight: 750,
                  letterSpacing: '-.035em',
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex',
                  alignItems: 'baseline',
                  '& .stat-suffix': { fontSize: '0.7em', lineHeight: 1, ml: '1px' },
                }
              : { mt: 0, minHeight: undefined }
          }
        >
          {value === null ? <LoadingSkeleton width="5rem" /> : value}
        </Typography>
        {dashboard && (
          <Typography
            component="div"
            variant="body2"
            sx={[
              {
                mt: 0.25,
                minHeight: '1.25em',
                fontWeight: 500,
                lineHeight: 1.25,
                overflowWrap: 'anywhere',
                color: 'text.secondary',
              },
              ...(Array.isArray(supportingTextSx) ? supportingTextSx : [supportingTextSx]),
            ]}
          >
            {supportingText ?? ''}
          </Typography>
        )}
        {footer && (
          <Stack sx={{ minHeight: 36, mt: 0.25 }} justifyContent="flex-end">
            {footer}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
