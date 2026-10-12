import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, Stack, Typography } from '@mui/material';
import { AppBrand } from '../brand/AppBrand';

export function SubjectCatalogEmptyState({ title, onShowAll }: { title: string; onShowAll?: () => void }) {
  return (
    <Stack
      aria-live="polite"
      aria-atomic="true"
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: 240,
        px: { xs: 3, sm: 4 },
        py: 4,
        transform: 'translateY(12px)',
        textAlign: 'center',
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 88,
          height: 88,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          borderRadius: '50%',
          bgcolor: 'rgba(185, 81, 27, .08)',
        }}
      >
        <AppBrand variant="icon" size={48} decorative />
      </Box>
      <Box>
        <Typography component="h3" variant="h6" sx={{ fontWeight: 800, letterSpacing: '-.02em' }}>
          {title}
        </Typography>
      </Box>
      {onShowAll && (
        <Button onClick={onShowAll} endIcon={<ArrowForwardRoundedIcon />}>
          Show all subjects
        </Button>
      )}
    </Stack>
  );
}
