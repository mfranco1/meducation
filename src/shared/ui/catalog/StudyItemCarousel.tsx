import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type StudyCarouselLayout = 'standard' | 'continueStudy';

export function StudyItemCarousel<T>({
  items,
  id,
  title,
  itemLabel,
  itemKey,
  renderItem,
  layout = 'standard',
  headingVisibility = 'visible',
}: {
  items: readonly T[];
  id: string;
  title: string;
  itemLabel: string;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  layout?: StudyCarouselLayout;
  headingVisibility?: 'visible' | 'srOnly';
}) {
  const [canRotate, setCanRotate] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [viewportRef, emblaApi] = useEmblaCarousel({ align: 'start', duration: 25, loop: true, slidesToScroll: 1 });
  const selectedItemKey = useRef<string | null>(null);
  const itemKeysRef = useRef<string[]>([]);
  const itemKeys = useMemo(() => items.map(itemKey), [items, itemKey]);
  const itemKeySignature = JSON.stringify(itemKeys);
  itemKeysRef.current = itemKeys;

  const updateCanRotate = useCallback(() => {
    if (!emblaApi) return;
    setCanRotate(emblaApi.scrollSnapList().length > 1);
    const selectedIndex = emblaApi.selectedScrollSnap();
    selectedItemKey.current = itemKeysRef.current[selectedIndex] ?? selectedItemKey.current;
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', updateCanRotate);
    emblaApi.on('reInit', updateCanRotate);
    updateCanRotate();
    return () => {
      emblaApi.off('select', updateCanRotate);
      emblaApi.off('reInit', updateCanRotate);
    };
  }, [emblaApi, updateCanRotate]);

  useEffect(() => {
    if (!emblaApi) return;
    const currentKey = selectedItemKey.current;
    emblaApi.reInit();
    if (currentKey && itemKeys.length > 0) {
      const nextIndex = itemKeys.indexOf(currentKey);
      if (nextIndex >= 0) emblaApi.scrollTo(nextIndex, true);
      else emblaApi.scrollTo(Math.min(emblaApi.selectedScrollSnap(), emblaApi.scrollSnapList().length - 1), true);
    }
    if (itemKeys.length === 0) selectedItemKey.current = null;
    updateCanRotate();
    // A JSON signature avoids reinitializing on parent renders that reuse the same stable item order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emblaApi, itemKeySignature]);

  const headingId = `${id}-heading`;
  const jump = reducedMotion;
  const scrollNext = () => {
    if (!emblaApi) return;
    if (emblaApi.canScrollNext()) emblaApi.scrollNext(jump);
    else emblaApi.scrollTo(0, jump);
  };
  const scrollPrevious = () => {
    if (!emblaApi) return;
    if (emblaApi.canScrollPrev()) emblaApi.scrollPrev(jump);
    else emblaApi.scrollTo(emblaApi.scrollSnapList().length - 1, jump);
  };

  if (!items.length) return null;
  const continueStudy = layout === 'continueStudy';
  return (
    <Box component="section" aria-labelledby={headingId} sx={{ mb: 4 }}>
      <Typography
        id={headingId}
        component="h2"
        variant="h6"
        sx={{
          fontWeight: 800,
          mb: headingVisibility === 'visible' ? 1.5 : 0,
          ...(headingVisibility === 'srOnly' ? visuallyHidden : {}),
        }}
      >
        {title}
      </Typography>
      <Box
        data-carousel-id={id}
        sx={{
          position: 'relative',
          ...(continueStudy
            ? {
                '--study-carousel-control-gutter': canRotate ? '28px' : '0px',
              }
            : {}),
        }}
      >
        {canRotate && (
          <IconButton
            aria-label={`Previous ${itemLabel}`}
            onClick={scrollPrevious}
            sx={{
              bgcolor: 'background.paper',
              left: continueStudy ? 4 : -24,
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              ...(continueStudy ? { width: 40, height: 40, boxShadow: '0 2px 8px rgba(70,38,20,.12)' } : {}),
            }}
          >
            <ChevronLeftRoundedIcon />
          </IconButton>
        )}
        <Box ref={viewportRef} sx={{ overflow: 'hidden', py: 0.5 }}>
          <Box
            data-testid="study-carousel-track"
            sx={{
              alignItems: 'stretch',
              display: 'flex',
              ...(continueStudy ? { gap: '16px' } : {}),
            }}
          >
            {items.map((item) => (
              <Box
                className="study-item-carousel-slide"
                data-testid="study-carousel-slide"
                key={itemKey(item)}
                sx={{
                  boxSizing: 'border-box',
                  flex: continueStudy
                    ? '0 0 100%'
                    : { xs: '0 0 100%', sm: '0 0 calc((100% + 16px) / 2)', md: '0 0 calc((100% + 16px) / 3)' },
                  minWidth: 0,
                  ...(continueStudy ? {} : { pr: { xs: 0, sm: 2 } }),
                }}
              >
                {renderItem(item)}
              </Box>
            ))}
          </Box>
        </Box>
        {canRotate && (
          <IconButton
            aria-label={`Next ${itemLabel}`}
            onClick={scrollNext}
            sx={{
              bgcolor: 'background.paper',
              position: 'absolute',
              right: continueStudy ? 4 : -24,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              ...(continueStudy ? { width: 40, height: 40, boxShadow: '0 2px 8px rgba(70,38,20,.12)' } : {}),
            }}
          >
            <ChevronRightRoundedIcon />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
