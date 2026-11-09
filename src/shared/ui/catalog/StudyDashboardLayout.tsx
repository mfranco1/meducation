import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';
import { LegalFooter } from '../shell/LegalFooter';

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
    <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 7 }, pb: { xs: 2, md: 3 } }}>
      {title && (
        <Typography variant="h1" sx={{ mb: 3 }}>
          {title}
        </Typography>
      )}
      {continueStudying ? (
        // With Continue Studying, the stats share its row on wide widths (see StatCardRow).
        <Box sx={{ containerName: 'study-hero', containerType: 'inline-size', mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 2, sm: 3 },
              '& .stat-card-row': { mb: 0 },
              '@container study-hero (min-width: 960px)': {
                alignItems: 'stretch',
                flexDirection: 'row-reverse',
                gap: 5,
              },
            }}
          >
            <Box sx={{ '@container study-hero (min-width: 960px)': { flex: '0 0 280px', py: 0.5 } }}>{summary}</Box>
            <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{continueStudying}</Box>
          </Box>
        </Box>
      ) : (
        summary
      )}
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
        <Typography variant="h6" component="h2">
          {subjectsHeading}
        </Typography>
        {subjectsActions}
      </Box>
      {children}
      <LegalFooter showAbout />
    </Container>
  );
}
