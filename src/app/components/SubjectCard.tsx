import { Card, CardActionArea, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { Subject } from '../../domain/types';

export function SubjectCard({ subject, onSelect, children }: { subject: Subject; onSelect: (subject: Subject) => void; children?: ReactNode }) {
  return <Card sx={{ height: '100%', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, '&:has(.Mui-focusVisible)': { borderColor: subject.accent }, transition: 'all .18s', '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } } }}>
    <CardActionArea aria-label={`Open ${subject.name}`} onClick={() => onSelect(subject)} sx={{ alignItems: 'flex-start', display: 'flex', height: '100%', justifyContent: 'flex-start', textAlign: 'left' }}>
      <CardContent sx={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', width: '100%' }}><Typography variant="h6">{subject.name}</Typography>
        {children}
      </CardContent>
    </CardActionArea>
  </Card>;
}
