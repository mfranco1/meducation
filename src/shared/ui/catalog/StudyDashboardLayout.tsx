import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';
import { LegalFooter } from '../shell/LegalFooter';

export function StudyDashboardLayout({
  title,
  summary,
  continueStudying,
  feature,
  children,
  subjectsHeading = 'All Subjects',
  subjectsActions,
}: {
  title?: string;
  summary?: ReactNode;
  continueStudying?: ReactNode;
  /** A card shown beside Continue Studying under the stats on wide widths, such as the Mixed Test. */
  feature?: ReactNode;
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
        // On wide widths Continue Studying is tall on the left. With a feature, the stats strip and the feature
        // share the right column; without one, the stats stack into a narrow panel (see StatCardRow).
        <Box
          sx={{
            containerName: feature ? 'study-hero' : 'study-hero study-hero-panel',
            containerType: 'inline-size',
            mb: 4,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: { xs: 2, sm: 3 },
              '& .stat-card-row': { mb: 0 },
              '@container study-hero (min-width: 960px)': {
                columnGap: 4,
                rowGap: 2,
                '& > .hero-summary': { gridArea: 'summary' },
                '& > .hero-continue': { gridArea: 'continue' },
                '& > .hero-feature': { gridArea: 'feature' },
                ...(feature
                  ? {
                      gridTemplateAreas: '"continue summary" "continue feature"',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                      gridTemplateRows: 'auto 1fr',
                    }
                  : {
                      gridTemplateAreas: '"continue summary"',
                      gridTemplateColumns: 'minmax(0, 1fr) 280px',
                    }),
              },
            }}
          >
            <Box className="hero-summary" sx={{ minWidth: 0 }}>
              {summary}
            </Box>
            <Box className="hero-continue" sx={{ minWidth: 0 }}>
              {continueStudying}
            </Box>
            {feature && (
              <Box className="hero-feature" sx={{ display: 'flex', minWidth: 0 }}>
                {feature}
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <>
          {summary}
          {feature && <Box sx={{ mb: 4 }}>{feature}</Box>}
        </>
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
