import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Box, Button, Container, Stack } from '@mui/material';

export function AppHeader({ onNavigateHome }: { onNavigateHome: () => void }) {
  return <Box component="header" sx={{ py: 2.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}>
    <Container maxWidth="lg"><Stack direction="row" alignItems="center">
      <Button disableRipple startIcon={<MenuBookRoundedIcon sx={{ color: 'primary.main' }} />} onClick={onNavigateHome} sx={{ p: 0, color: 'text.primary', fontSize: 20, letterSpacing: '-.04em', bgcolor: 'transparent', transition: 'none', '&:hover, &:active': { bgcolor: 'transparent' } }}>
        <Box component="span" sx={{ color: 'primary.main' }}>Med</Box>ucation
      </Button>
    </Stack></Container>
  </Box>;
}
