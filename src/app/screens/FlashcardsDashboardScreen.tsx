import { Container, Typography } from '@mui/material';

export function FlashcardsDashboardScreen() {
  return <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
    <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-.04em', mb: 1 }}>Flashcards</Typography>
    <Typography color="text.secondary">Work in progress. Your flashcards dashboard is coming soon.</Typography>
  </Container>;
}
