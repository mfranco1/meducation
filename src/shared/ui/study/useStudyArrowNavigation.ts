import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { canHandleStudyShortcut, hasOpenModal } from './studyKeyboard';

/** Shortest horizontal travel, in px, that counts as a swipe. */
const SWIPE_DISTANCE = 60;
/** Touches that start this close to a screen edge belong to the browser's back and forward gestures. */
const SWIPE_EDGE = 24;
/** A pause in wheel events, in ms, that ends a trackpad swipe. */
const WHEEL_GESTURE_GAP = 200;

/**
 * A swipe must start on the question or card itself, not in a form control or inside anything that
 * scrolls sideways (wide tables, formulas).
 */
function canSwipeFrom(target: EventTarget | null, area: HTMLElement | null) {
  if (!(target instanceof Element) || !area?.contains(target)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return false;
  for (let element: Element | null = target; element && element !== area; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth && /auto|scroll/.test(window.getComputedStyle(element).overflowX))
      return false;
  }
  return true;
}

export function useStudyArrowNavigation({
  index,
  total,
  disabled = false,
  hasPrevious = index > 0,
  hasNext = index < total - 1,
  onPrevious,
  onNext,
  swipeArea,
  nextButtonRef,
  finishButtonRef,
}: {
  index: number;
  total: number;
  disabled?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** The question or card; touch and trackpad swipes that start inside it navigate like the arrows. */
  swipeArea: RefObject<HTMLElement | null>;
  nextButtonRef?: MutableRefObject<HTMLButtonElement | null>;
  finishButtonRef?: MutableRefObject<HTMLButtonElement | null>;
}) {
  const latest = useRef({
    index,
    total,
    disabled,
    hasPrevious,
    hasNext,
    onPrevious,
    onNext,
    nextButtonRef,
    finishButtonRef,
  });
  const focusFinishAfterAdvance = useRef(false);
  latest.current = { index, total, disabled, hasPrevious, hasNext, onPrevious, onNext, nextButtonRef, finishButtonRef };

  useLayoutEffect(() => {
    if (!hasNext && focusFinishAfterAdvance.current) {
      finishButtonRef?.current?.focus();
      focusFinishAfterAdvance.current = false;
    }
  }, [index, hasNext, finishButtonRef]);

  const onArrowNext = useCallback(() => {
    const state = latest.current;
    if (!state.hasNext) return;
    focusFinishAfterAdvance.current = Boolean(
      state.nextButtonRef?.current && document.activeElement === state.nextButtonRef.current,
    );
    state.onNext();
  }, []);

  useLayoutEffect(() => {
    const move = (direction: 'previous' | 'next') => {
      const state = latest.current;
      if (state.total < 1 || state.index < 0 || state.index >= state.total) return;
      if (direction === 'previous') {
        if (state.hasPrevious) state.onPrevious();
      } else onArrowNext();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (latest.current.disabled || !canHandleStudyShortcut(event, 'arrow')) return;
      event.preventDefault();
      if (!event.repeat) move(event.key === 'ArrowLeft' ? 'previous' : 'next');
    };
    // Touch and trackpad swipes on the item act like the arrows: left for next, right for previous. Mouse drags keep selecting text.
    let swipeStart: { x: number; y: number } | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      swipeStart =
        event.touches.length === 1 &&
        touch &&
        touch.clientX > SWIPE_EDGE &&
        touch.clientX < window.innerWidth - SWIPE_EDGE &&
        canSwipeFrom(event.target, swipeArea.current)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const start = swipeStart;
      swipeStart = null;
      if (!start || !touch || event.touches.length > 0) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return;
      if (latest.current.disabled || hasOpenModal() || window.getSelection()?.toString()) return;
      move(dx < 0 ? 'next' : 'previous');
    };
    const cancelSwipe = () => {
      swipeStart = null;
    };
    // Trackpad swipes arrive as wheel events. Sideways scrolling past SWIPE_DISTANCE moves once per
    // gesture; the gesture (including momentum) ends after a short pause in wheel events.
    let wheel = { x: 0, y: 0, last: 0, done: false };
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || latest.current.disabled || !canSwipeFrom(event.target, swipeArea.current)) return;
      if (event.timeStamp - wheel.last > WHEEL_GESTURE_GAP) wheel = { x: 0, y: 0, last: 0, done: false };
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      wheel.x += event.deltaX * scale;
      wheel.y += event.deltaY * scale;
      wheel.last = event.timeStamp;
      if (Math.abs(wheel.x) < 2 * Math.abs(wheel.y)) return;
      // Keep the browser's own back and forward swipe from taking over.
      event.preventDefault();
      if (wheel.done || Math.abs(wheel.x) < SWIPE_DISTANCE || hasOpenModal()) return;
      wheel.done = true;
      move(wheel.x > 0 ? 'next' : 'previous');
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', cancelSwipe);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', cancelSwipe);
    };
  }, [onArrowNext, swipeArea]);

  return onArrowNext;
}
