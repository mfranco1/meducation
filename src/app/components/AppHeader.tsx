import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import { Box, Button, Container, Stack } from '@mui/material';

export function AppBrand({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  const brand = <Stack direction="row" alignItems="center" spacing={.75} sx={{ color: 'text.primary', fontSize: 20, letterSpacing: '-.04em', fontWeight: 700, justifyContent: compact ? 'center' : 'flex-start' }}>
    <MenuBookRoundedIcon aria-hidden="true" sx={{ color: 'primary.main' }} />
    {!compact && <Box component="span"><Box component="span" sx={{ color: 'primary.main' }}>Med</Box>ucation</Box>}
  </Stack>;
  return onClick
    ? <Button disableRipple aria-label="Meducation, go to Quizzes" onClick={onClick} sx={{ minWidth: 0, width: '100%', height: 48, boxSizing: 'border-box', p: 1, borderRadius: '10px', justifyContent: compact ? 'center' : 'flex-start', color: 'text.primary', bgcolor: 'transparent', '&:hover, &:active': { bgcolor: 'transparent' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>{brand}</Button>
    : brand;
}

export function AppHeader({ onNavigateHome }: { onNavigateHome?: () => void }) {
  return <Box component="header" sx={{ py: 2.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}>
    <Container maxWidth="lg"><Stack direction="row" alignItems="center">
      <AppBrand onClick={onNavigateHome} />
    </Stack></Container>
  </Box>;
}
