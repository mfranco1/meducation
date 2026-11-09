import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { shadow } from '../../theme';

const SLIDE_GAP = 16;
/** Scale of a peeking neighbor; it grows to full size as it moves into the center. */
const PEEK_SCALE = 0.85;
/** How far a peeking neighbor tucks behind the selected card, in px. */
const PEEK_TUCK = 12;
const PEEK_TILT_DEG = 8;
/**
 * Fewest slides that keep both peeks filled while the loop wraps. With fewer, Embla must move a
 * visible card from one side to the other, so short lists are rendered several times over.
 */
const MIN_LOOP_SLIDES = 5;

/** Blocks the browser's swipe-back navigation for any wheel gesture with a real horizontal part. */
function preventHorizontalWheel(event: WheelEvent) {
  if (event.deltaX !== 0 && Math.abs(event.deltaX) * 2 >= Math.abs(event.deltaY)) event.preventDefault();
}

/** Scales, tucks and tilts each card by its distance from the center so neighbors read as set back. */
function applyDepth(api: EmblaCarouselType) {
  const viewport = api.rootNode().getBoundingClientRect();
  const center = viewport.left + viewport.width / 2;
  const slides = api.slideNodes();
  const positions = slides.map((slide) => {
    const rect = slide.getBoundingClientRect();
    return { offset: (rect.left + rect.width / 2 - center) / (rect.width + SLIDE_GAP), width: rect.width };
  });
  slides.forEach((slide, index) => {
    const { offset, width } = positions[index];
    const distance = Math.abs(offset);
    const depth = Math.min(distance, 1);
    const direction = Math.sign(offset);
    const scale = 1 - (1 - PEEK_SCALE) * depth;
    const tuck = direction * depth * (SLIDE_GAP + ((1 - PEEK_SCALE) * width) / 2 + PEEK_TUCK);
    const card = slide.firstElementChild as HTMLElement | null;
    slide.style.zIndex = String(100 - Math.round(distance * 10));
    if (!card) return;
    card.style.transform = `translateX(${-tuck}px) perspective(1200px) rotateY(${-direction * depth * PEEK_TILT_DEG}deg) scale(${scale})`;
    card.style.opacity = String(Math.max(0, 1 - 0.4 * depth - Math.max(0, distance - 1)));
  });
}

export function StudyItemCarousel<T>({
  items,
  id,
  title,
  itemLabel,
  itemKey,
  renderItem,
}: {
  items: readonly T[];
  id: string;
  title: string;
  itemLabel: string;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const [canRotate, setCanRotate] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Listening on the whole section lets a swipe that starts over an arrow move the carousel too.
  const plugins = useMemo(() => (root ? [WheelGesturesPlugin({ target: root })] : []), [root]);
  const [viewportRef, emblaApi] = useEmblaCarousel(
    { align: 'center', containScroll: false, duration: 30, loop: true, skipSnaps: true, slidesToScroll: 1 },
    plugins,
  );
  const selectedItemKey = useRef<string | null>(null);
  const itemKeysRef = useRef<string[]>([]);
  const itemKeys = useMemo(() => items.map(itemKey), [items, itemKey]);
  const itemKeySignature = JSON.stringify(itemKeys);
  itemKeysRef.current = itemKeys;

  const updateCanRotate = useCallback(() => {
    if (!emblaApi) return;
    setCanRotate(emblaApi.scrollSnapList().length > 1);
    const index = emblaApi.selectedScrollSnap();
    setSelectedSlide(index);
    const keys = itemKeysRef.current;
    selectedItemKey.current = keys[index % keys.length] ?? selectedItemKey.current;
  }, [emblaApi]);

  useEffect(() => {
    if (!root) return;
    root.addEventListener('wheel', preventHorizontalWheel, { passive: false });
    return () => root.removeEventListener('wheel', preventHorizontalWheel);
  }, [root]);

  useEffect(() => {
    if (!emblaApi) return;
    const depth = () => applyDepth(emblaApi);
    const sync = () => {
      updateCanRotate();
      depth();
    };
    emblaApi.on('select', updateCanRotate);
    emblaApi.on('reInit', sync);
    emblaApi.on('scroll', depth);
    sync();
    return () => {
      emblaApi.off('select', updateCanRotate);
      emblaApi.off('reInit', sync);
      emblaApi.off('scroll', depth);
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
  const single = items.length === 1;
  const copies = single ? 1 : Math.ceil(MIN_LOOP_SLIDES / items.length);
  const slides = Array.from({ length: copies }, (_, copy) => items.map((item) => ({ item, copy }))).flat();
  const arrowSx = { bgcolor: 'background.paper', boxShadow: shadow.raised, height: 40, width: 40 } as const;
  return (
    <Box
      ref={setRoot}
      component="section"
      aria-labelledby={headingId}
      sx={{ containerName: 'study-carousel', containerType: 'inline-size', position: 'relative' }}
    >
      <Typography id={headingId} component="h2" variant="h6" sx={visuallyHidden}>
        {title}
      </Typography>
      <Box
        ref={viewportRef}
        data-carousel-id={id}
        sx={{
          overflow: 'hidden',
          py: 0.5,
          // Fades the outer edges of the peeking cards into the page.
          '--edge-fade': '20px',
          '@container study-carousel (min-width: 600px)': { '--edge-fade': '96px' },
          maskImage: single
            ? undefined
            : 'linear-gradient(to right, transparent, #000 var(--edge-fade), #000 calc(100% - var(--edge-fade)), transparent)',
        }}
      >
        <Box data-testid="study-carousel-track" sx={{ alignItems: 'stretch', display: 'flex', gap: `${SLIDE_GAP}px` }}>
          {slides.map(({ item, copy }, index) => (
            <Box
              className="study-item-carousel-slide"
              data-testid="study-carousel-slide"
              key={`${itemKey(item)}:${copy}`}
              // Peeking cards are inert, so a click on one lands here and brings it to the center.
              onClick={() => {
                if (emblaApi && index !== emblaApi.selectedScrollSnap()) emblaApi.scrollTo(index, jump);
              }}
              sx={{
                boxSizing: 'border-box',
                flex: single ? '0 0 100%' : '0 0 calc(100% - 48px)',
                minWidth: 0,
                position: 'relative',
                '& > *': { transformOrigin: 'center', willChange: 'transform' },
                '@container study-carousel (min-width: 600px)': single ? {} : { flex: '0 0 calc(100% - 240px)' },
              }}
            >
              <Box inert={!single && index !== selectedSlide}>{renderItem(item)}</Box>
            </Box>
          ))}
        </Box>
      </Box>
      {canRotate && (
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            gap: 1.5,
            justifyContent: 'center',
            mt: 1,
            '@container study-carousel (min-width: 600px)': {
              mt: 0,
              '& .study-carousel-arrow': {
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 200,
              },
              '& .study-carousel-previous': { left: 12 },
              '& .study-carousel-next': { right: 12 },
              '& .study-carousel-position': visuallyHidden,
            },
          }}
        >
          <IconButton
            className="study-carousel-arrow study-carousel-previous"
            aria-label={`Previous ${itemLabel}`}
            onClick={scrollPrevious}
            sx={arrowSx}
          >
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Typography
            className="study-carousel-position"
            variant="body2"
            sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'center' }}
          >
            {(selectedSlide % items.length) + 1} of {items.length}
          </Typography>
          <IconButton
            className="study-carousel-arrow study-carousel-next"
            aria-label={`Next ${itemLabel}`}
            onClick={scrollNext}
            sx={arrowSx}
          >
            <ChevronRightRoundedIcon />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
