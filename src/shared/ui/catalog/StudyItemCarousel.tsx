import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { focusRingInset, radius, shadow } from '../../theme';
import { tallHero } from './ContinueStudyCard';

const SLIDE_GAP = 16;
/** Scale of a peeking neighbor; it grows to full size as it moves into the center. */
const PEEK_SCALE = 0.78;
/** Share of the space beside the selected card that a peeking neighbor shows; the rest of it sits behind the card. */
const PEEK_REVEAL = 0.7;
const PEEK_TILT_DEG = 8;
/**
 * Fewest slides that keep both peeks filled while the loop wraps. With fewer, Embla must move a
 * visible card from one side to the other, so short lists are rendered several times over.
 */
const MIN_LOOP_SLIDES = 5;
/** Callers pass items most recent first; only these many are kept. */
const MAX_ITEMS = 5;
/** Room around the cards for their shadow, which the viewport would otherwise clip, in px. */
const SHADOW_ROOM = 32;

/** Blocks the browser's swipe-back navigation for any wheel gesture with a real horizontal part. */
function preventHorizontalWheel(event: WheelEvent) {
  if (event.deltaX !== 0 && Math.abs(event.deltaX) * 2 >= Math.abs(event.deltaY)) event.preventDefault();
}

/**
 * Scales, tucks, tilts and fades each card by its distance from the center so neighbors peek from behind it.
 * Cards read `--carousel-peek` (0 centered, 1 peeking) to swap their text for artwork, and `--carousel-side`
 * (-1 left of center, otherwise 1) to turn that artwork toward the edge that shows.
 */
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
    // A peeking card's center sits here, leaving only its outer edge showing beside the selected card.
    const peekOffset = ((1 - PEEK_SCALE) * width) / 2 + ((viewport.width - width) / 2) * PEEK_REVEAL;
    const tuck = direction * depth * (width + SLIDE_GAP - peekOffset);
    const card = slide.firstElementChild as HTMLElement | null;
    slide.style.zIndex = String(100 - Math.round(distance * 10));
    if (!card) return;
    card.style.transform = `translateX(${-tuck}px) perspective(1200px) rotateY(${-direction * depth * PEEK_TILT_DEG}deg) scale(${scale})`;
    // Opaque until halfway out, so a card crossing in front of another hides it.
    card.style.opacity = String(Math.max(0, 1 - Math.max(0, depth - 0.5) - Math.max(0, distance - 1)));
    card.style.setProperty('--carousel-peek', String(depth));
    card.style.setProperty('--carousel-side', direction < 0 ? '-1' : '1');
  });
}

export function StudyItemCarousel<T>({
  items: allItems,
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
  const items = useMemo(() => allItems.slice(0, MAX_ITEMS), [allItems]);
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
  const selectedItem = selectedSlide % items.length;
  // Stays within the selected copy so the carousel moves the short way.
  const scrollToItem = (item: number) => emblaApi?.scrollTo(selectedSlide - selectedItem + item, jump);
  const copies = single ? 1 : Math.ceil(MIN_LOOP_SLIDES / items.length);
  const slides = Array.from({ length: copies }, (_, copy) => items.map((item) => ({ item, copy }))).flat();
  const arrowSx = {
    bgcolor: 'background.paper',
    boxShadow: shadow.raised,
    height: 40,
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 40,
    zIndex: 200,
  } as const;
  return (
    <Box
      ref={setRoot}
      component="section"
      aria-labelledby={headingId}
      sx={{
        containerName: 'study-carousel',
        containerType: 'inline-size',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      <Typography id={headingId} component="h2" variant="h6" sx={visuallyHidden}>
        {title}
      </Typography>
      <Box sx={{ flex: '1 1 auto', position: 'relative' }}>
        <Box
          ref={viewportRef}
          data-carousel-id={id}
          sx={{
            boxSizing: 'border-box',
            // A single card fills the viewport, so clipping would cut its shadow at the sides.
            overflow: single ? 'visible' : 'hidden',
            // The shadow room hangs outside the layout box, so the cards align with what sits beside the carousel.
            my: `-${SHADOW_ROOM}px`,
            py: `${SHADOW_ROOM}px`,
            // With the arrows overlaid, the cards fill the height they are given (see StudyDashboardLayout).
            '@container study-carousel (min-width: 440px)': { height: `calc(100% + ${SHADOW_ROOM * 2}px)` },
          }}
        >
          <Box
            data-testid="study-carousel-track"
            sx={{ alignItems: 'stretch', display: 'flex', gap: `${SLIDE_GAP}px`, height: '100%' }}
          >
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
                  '@container study-carousel (min-width: 440px)': single ? {} : { flex: '0 0 calc(100% - 112px)' },
                  '@container study-carousel (min-width: 800px)': single ? {} : { flex: '0 0 calc(100% - 240px)' },
                }}
              >
                <Box inert={!single && index !== selectedSlide} sx={{ height: '100%' }}>
                  {renderItem(item)}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        {canRotate && (
          // Narrow widths rely on swiping and the dots.
          <Box sx={{ '@container study-carousel (max-width: 439px)': { display: 'none' } }}>
            <IconButton aria-label={`Previous ${itemLabel}`} onClick={scrollPrevious} sx={{ ...arrowSx, left: 12 }}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <IconButton aria-label={`Next ${itemLabel}`} onClick={scrollNext} sx={{ ...arrowSx, right: 12 }}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Box>
        )}
      </Box>
      {canRotate && (
        <Box
          sx={{
            display: 'flex',
            height: 28,
            justifyContent: 'center',
            // Beside the stats the dots hang below, so the cards end level with the column next to them.
            [tallHero]: { left: 0, position: 'absolute', right: 0, top: '100%' },
          }}
        >
          {items.map((item, index) => (
            <Box
              key={itemKey(item)}
              component="button"
              type="button"
              aria-label={`Show ${itemLabel} ${index + 1} of ${items.length}`}
              aria-current={index === selectedItem || undefined}
              onClick={() => scrollToItem(index)}
              sx={{
                alignItems: 'center',
                bgcolor: 'transparent',
                border: 0,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                p: 0,
                width: 20,
                '&::after': {
                  bgcolor: index === selectedItem ? 'primary.main' : 'primary.light',
                  borderRadius: radius.pill,
                  content: '""',
                  height: 8,
                  width: 8,
                },
                '&:focus-visible': { ...focusRingInset, borderRadius: radius.pill },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
