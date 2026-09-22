import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { SubjectStat } from '../dashboard';
import { SubjectCard } from './SubjectCard';

export function ActiveSubjectCarousel({ subjects, onSelectSubject }: { subjects: SubjectStat[]; onSelectSubject: (subject: SubjectStat['subject']) => void }) {
  const [index, setIndex] = useState(0);
  const subjectCount = subjects.length;

  useEffect(() => setIndex(current => Math.min(current, Math.max(subjectCount - 1, 0))), [subjectCount]);
  if (!subjectCount) return null;

  const current = subjects[index];
  const move = (direction: 1 | -1) => setIndex(currentIndex => (currentIndex + direction + subjectCount) % subjectCount);

  return <Box component="section" aria-labelledby="continue-studying-heading" sx={{ mb: 4 }}>
    <Typography id="continue-studying-heading" variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Continue Studying</Typography>
    <Stack alignItems="center" direction="row" spacing={{ xs: 0.5, sm: 1 }} sx={{ maxWidth: { md: 540 } }}>
      {subjectCount > 1 && <IconButton aria-label="Previous active subject" onClick={() => move(-1)}><ChevronLeftRoundedIcon /></IconButton>}
      <Box sx={{ flex: 1, minWidth: 0 }}><SubjectCard key={current.subject.id} stat={current} onSelect={onSelectSubject} /></Box>
      {subjectCount > 1 && <IconButton aria-label="Next active subject" onClick={() => move(1)}><ChevronRightRoundedIcon /></IconButton>}
    </Stack>
  </Box>;
}
