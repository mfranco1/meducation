import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';
import type { SubjectStat } from '../dashboard';
import { SubjectCard } from './SubjectCard';

export function ActiveSubjectCarousel({ subjects, onSelectSubject }: { subjects: SubjectStat[]; onSelectSubject: (subject: SubjectStat['subject']) => void }) {
  const [canRotate, setCanRotate] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: 'start', duration: 25, loop: true, slidesToScroll: 1 });
  const updateCanRotate = useCallback(() => {
    if (!emblaApi) return;
    setCanRotate(emblaApi.canScrollPrev() || emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
    updateCanRotate();
    emblaApi.on('reInit', updateCanRotate);
    return () => { emblaApi.off('reInit', updateCanRotate); };
  }, [emblaApi, subjects, updateCanRotate]);

  if (!subjects.length) return null;

  return <Box component="section" aria-labelledby="continue-studying-heading" sx={{ mb: 4 }}>
    <Typography id="continue-studying-heading" variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Continue Studying</Typography>
    <Box sx={{ position: 'relative' }}>
      {canRotate && <IconButton aria-label="Previous active subject" onClick={() => emblaApi?.scrollPrev(reducedMotion)} sx={{ bgcolor: 'background.paper', left: -24, position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronLeftRoundedIcon /></IconButton>}
      <Box ref={viewportRef} sx={{ overflow: 'hidden', py: 0.5 }}>
        <Box sx={{ display: 'flex' }}>
          {subjects.map(stat => <Box key={stat.subject.id} sx={{ boxSizing: 'border-box', flex: { xs: '0 0 100%', sm: '0 0 calc((100% + 16px) / 2)', md: '0 0 calc((100% + 16px) / 3)' }, minWidth: 0, pr: { xs: 0, sm: 2 } }}>
            <SubjectCard stat={stat} onSelect={onSelectSubject} />
          </Box>)}
        </Box>
      </Box>
      {canRotate && <IconButton aria-label="Next active subject" onClick={() => emblaApi?.scrollNext(reducedMotion)} sx={{ bgcolor: 'background.paper', position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronRightRoundedIcon /></IconButton>}
    </Box>
  </Box>;
}
