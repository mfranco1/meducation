import type { ReactNode } from 'react';
import { Container, Typography } from '@mui/material';

export function StudyDashboardLayout({ title, summary, continueStudying, children, subjectsHeading = 'All Subjects' }: {
  title?: string;
  summary?: ReactNode;
  continueStudying?: ReactNode;
  children: ReactNode;
  subjectsHeading?: string;
}) {
  return <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
    {title && <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-.04em', mb: 3 }}>{title}</Typography>}
    {summary}
    {continueStudying}
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{subjectsHeading}</Typography>
    {children}
  </Container>;
}
