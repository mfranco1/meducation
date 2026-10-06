import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Button, Container, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function SubjectBrowseLayout({ subjectName, onBack, children }: { subjectName: string; onBack: () => void; children: ReactNode }) {
  return <Container maxWidth="md" sx={{ py: 5 }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">All subjects</Button>
    <Typography variant="h3" sx={{ mt: 3, mb: 4 }}>{subjectName}</Typography>
    {children}
  </Container>;
}
