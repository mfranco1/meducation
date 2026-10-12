import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';

export function StudyDashboardLayout({
  title,
  summary,
  continueStudying,
  children,
  subjectsHeading = 'All Subjects',
  subjectsActions,
}: {
  title?: string;
  summary?: ReactNode;
  continueStudying?: ReactNode;
  children: ReactNode;
  subjectsHeading?: string;
  subjectsActions?: ReactNode;
}) {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
      {title && (
        <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-.04em', mb: 3 }}>
          {title}
        </Typography>
      )}
      {summary}
      {continueStudying}
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
          {subjectsHeading}
        </Typography>
        {subjectsActions}
      </Box>
      {children}
    </Container>
  );
}
