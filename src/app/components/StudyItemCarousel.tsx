import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export function StudyItemCarousel<T>({ items, id, title, itemLabel, itemKey, renderItem }: {
  items: readonly T[];
  id: string;
  title: string;
  itemLabel: string;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
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
  }, [emblaApi, items, updateCanRotate]);

  if (!items.length) return null;
  const headingId = `${id}-heading`;
  return <Box component="section" aria-labelledby={headingId} sx={{ mb: 4 }}>
    <Typography id={headingId} variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{title}</Typography>
    <Box sx={{ position: 'relative' }}>
      {canRotate && <IconButton aria-label={`Previous ${itemLabel}`} onClick={() => emblaApi?.scrollPrev(reducedMotion)} sx={{ bgcolor: 'background.paper', left: -24, position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronLeftRoundedIcon /></IconButton>}
      <Box ref={viewportRef} sx={{ overflow: 'hidden', py: 0.5 }}>
        <Box sx={{ display: 'flex' }}>
          {items.map(item => <Box key={itemKey(item)} sx={{ boxSizing: 'border-box', flex: { xs: '0 0 100%', sm: '0 0 calc((100% + 16px) / 2)', md: '0 0 calc((100% + 16px) / 3)' }, minWidth: 0, pr: { xs: 0, sm: 2 } }}>
            {renderItem(item)}
          </Box>)}
        </Box>
      </Box>
      {canRotate && <IconButton aria-label={`Next ${itemLabel}`} onClick={() => emblaApi?.scrollNext(reducedMotion)} sx={{ bgcolor: 'background.paper', position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}><ChevronRightRoundedIcon /></IconButton>}
    </Box>
  </Box>;
}
