import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { canHandleStudyShortcut } from './studyKeyboard';

export function useStudyArrowNavigation({ index, total, disabled = false, onPrevious, onNext, nextButtonRef, finishButtonRef }: {
  index: number;
  total: number;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  nextButtonRef?: MutableRefObject<HTMLButtonElement | null>;
  finishButtonRef?: MutableRefObject<HTMLButtonElement | null>;
}) {
  const latest = useRef({ index, total, disabled, onPrevious, onNext, nextButtonRef, finishButtonRef });
  const focusFinishAfterAdvance = useRef(false);
  latest.current = { index, total, disabled, onPrevious, onNext, nextButtonRef, finishButtonRef };

  useLayoutEffect(() => {
    if (index === total - 1 && focusFinishAfterAdvance.current) {
      finishButtonRef?.current?.focus();
      focusFinishAfterAdvance.current = false;
    }
  }, [index, total, finishButtonRef]);

  const onArrowNext = useCallback(() => {
    const state = latest.current;
    if (state.index >= state.total - 1) return;
    focusFinishAfterAdvance.current = Boolean(state.nextButtonRef?.current && document.activeElement === state.nextButtonRef.current);
    state.onNext();
  }, []);

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (!canHandleStudyShortcut(event, 'arrow')) return;
      event.preventDefault();
      const state = latest.current;
      if (state.disabled || state.total < 1 || state.index < 0 || state.index >= state.total) return;
      if (event.repeat) return;
      if (event.key === 'ArrowLeft') {
        if (state.index > 0) state.onPrevious();
      } else onArrowNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onArrowNext]);

  return onArrowNext;
}
