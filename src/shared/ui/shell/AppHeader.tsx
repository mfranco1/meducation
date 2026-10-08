import { Box, Container, Stack } from '@mui/material';
import { AppBrand } from '../brand/AppBrand';

export function AppHeader({ onNavigateHome }: { onNavigateHome?: () => void }) {
  return (
    <Box component="header" sx={{ py: 2.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}>
      <Container maxWidth="lg">
        <Stack direction="row" alignItems="center">
          <AppBrand onClick={onNavigateHome} actionLabel="go to Quizzes" />
        </Stack>
      </Container>
    </Box>
  );
}
