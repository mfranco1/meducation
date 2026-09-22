import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import type { SubjectStat } from '../dashboard';
import { SubjectCard } from './SubjectCard';

export function ActiveSubjectCarousel({ subjects, onSelectSubject }: { subjects: SubjectStat[]; onSelectSubject: (subject: SubjectStat['subject']) => void }) {
  const [index, setIndex] = useState(0);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isTablet = useMediaQuery(theme.breakpoints.up('sm'));
  const subjectCount = subjects.length;
  const visibleCount = isDesktop ? 3 : isTablet ? 2 : 1;

  useEffect(() => setIndex(current => Math.min(current, Math.max(subjectCount - 1, 0))), [subjectCount]);
  if (!subjectCount) return null;

  const visibleSubjects = Array.from({ length: Math.min(visibleCount, subjectCount) }, (_, offset) => subjects[(index + offset) % subjectCount]);
  const move = (direction: 1 | -1) => setIndex(currentIndex => (currentIndex + direction + subjectCount) % subjectCount);

  return <Box component="section" aria-labelledby="continue-studying-heading" sx={{ mb: 4 }}>
    <Typography id="continue-studying-heading" variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Continue Studying</Typography>
    <Box sx={{ position: 'relative' }}>
      {subjectCount > 1 && <IconButton aria-label="Previous active subject" onClick={() => move(-1)} sx={{ bgcolor: 'background.paper', left: -24, position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronLeftRoundedIcon /></IconButton>}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' } }}>
        {visibleSubjects.map(stat => <SubjectCard key={stat.subject.id} stat={stat} onSelect={onSelectSubject} />)}
      </Box>
      {subjectCount > 1 && <IconButton aria-label="Next active subject" onClick={() => move(1)} sx={{ bgcolor: 'background.paper', position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronRightRoundedIcon /></IconButton>}
    </Box>
  </Box>;
}
