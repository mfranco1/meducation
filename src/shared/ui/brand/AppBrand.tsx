import { Box, Button, Stack } from '@mui/material';
import { brand } from '../../brand';
import { BrandMark } from './BrandMark';

type AppBrandProps = {
  onClick?: () => void;
  actionLabel?: string;
  compact?: boolean;
  tone?: 'default' | 'inverse';
};

export function AppBrand({ onClick, actionLabel, compact = false, tone = 'default' }: AppBrandProps) {
  if (onClick && !actionLabel) throw new Error('A clickable AppBrand requires an actionLabel.');

  const wordmark = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{
        color: tone === 'inverse' ? '#fff' : 'text.primary',
        fontSize: 20,
        letterSpacing: '-.04em',
        fontWeight: 700,
        justifyContent: compact ? 'center' : 'flex-start',
      }}
    >
      <BrandMark tone={tone} />
      {!compact && (
        <Box component="span">
          <Box component="span" sx={{ color: tone === 'inverse' ? '#fff' : 'primary.main' }}>
            {brand.wordmark.emphasis}
          </Box>
          {brand.wordmark.remainder}
        </Box>
      )}
    </Stack>
  );

  return onClick ? (
    <Button
      disableRipple
      aria-label={`${brand.name}, ${actionLabel}`}
      onClick={onClick}
      sx={{
        minWidth: 0,
        width: '100%',
        height: 48,
        boxSizing: 'border-box',
        p: 1,
        borderRadius: '10px',
        justifyContent: compact ? 'center' : 'flex-start',
        color: 'text.primary',
        bgcolor: 'transparent',
        '&:hover, &:active': { bgcolor: 'transparent' },
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {wordmark}
    </Button>
  ) : (
    wordmark
  );
}
