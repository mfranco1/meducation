import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import { useEffect, useRef, type Ref } from 'react';
import { Box, ButtonBase, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { isCorrect } from '../../../domain/quizEngine';
import type { Attempt, Question } from '../../../domain/types';

export type QuestionNavigatorFilter = 'all' | 'unanswered' | 'flagged';

export interface QuestionNavigationItem {
  index: number;
  number: number;
  answered: boolean;
  flagged: boolean;
  wrong: boolean;
}

export function questionNavigationItems(questions: Question[], attempt: Attempt): QuestionNavigationItem[] {
  return questions.map((question, index) => {
    const response = attempt.responses[question.id];
    const answerUnderReview = Boolean(question.rationaleMeta?.answerReviewNote);
    return {
      index,
      number: index + 1,
      answered: Boolean(response?.selectedChoiceId),
      flagged: Boolean(response?.flagged),
      wrong: attempt.feedbackMode === 'immediate' && Boolean(response?.locked && response.selectedChoiceId && !answerUnderReview && !isCorrect(question, response.selectedChoiceId)),
    };
  });
}

export function filterQuestionNavigationItems(items: QuestionNavigationItem[], filter: QuestionNavigatorFilter) {
  if (filter === 'unanswered') return items.filter(item => !item.answered);
  if (filter === 'flagged') return items.filter(item => item.flagged);
  return items;
}

interface QuestionNavigatorProps {
  questions: Question[];
  attempt: Attempt;
  currentIndex: number;
  filter: QuestionNavigatorFilter;
  onFilterChange: (filter: QuestionNavigatorFilter) => void;
  onNavigate: (index: number) => void;
}

export function QuestionNavigator({ questions, attempt, currentIndex, filter, onFilterChange, onNavigate }: QuestionNavigatorProps) {
  const items = questionNavigationItems(questions, attempt);
  const visibleItems = filterQuestionNavigationItems(items, filter);
  const unanswered = items.filter(item => !item.answered).length;
  const flagged = items.filter(item => item.flagged).length;
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const currentTile = currentTileRef.current;
    if (!scrollArea || !currentTile) return;

    const frame = requestAnimationFrame(() => {
      const areaBounds = scrollArea.getBoundingClientRect();
      const tileBounds = currentTile.getBoundingClientRect();
      const tileCenter = tileBounds.top - areaBounds.top + tileBounds.height / 2;
      const centerBandStart = scrollArea.clientHeight * .25;
      const centerBandEnd = scrollArea.clientHeight * .75;
      if (tileCenter >= centerBandStart && tileCenter <= centerBandEnd) return;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollArea.scrollTo({
        top: scrollArea.scrollTop + tileCenter - scrollArea.clientHeight / 2,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, filter]);

  return <Stack spacing={2} aria-label="Question navigator">
    <ToggleButtonGroup
      value={filter}
      exclusive
      fullWidth
      size="small"
      aria-label="Filter questions"
      onChange={(_, value: QuestionNavigatorFilter | null) => { if (value) onFilterChange(value); }}
    >
      <ToggleButton value="all" aria-label={`All questions, ${items.length}`}>All</ToggleButton>
      <ToggleButton value="unanswered" aria-label={`Unanswered questions, ${unanswered}`}>Open</ToggleButton>
      <ToggleButton value="flagged" aria-label={`Flagged questions, ${flagged}`}>Flagged</ToggleButton>
    </ToggleButtonGroup>
    <Box ref={scrollAreaRef} sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 110px)', md: 470 }, p: .75 }}>
      {visibleItems.length ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1 }}>
        {visibleItems.map(item => <QuestionTile key={item.index} item={item} current={item.index === currentIndex} tileRef={item.index === currentIndex ? currentTileRef : undefined} onClick={() => onNavigate(item.index)} />)}
      </Box> : <Box sx={{ py: 5, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">{filter === 'flagged' ? 'No flagged questions.' : 'No unanswered questions.'}</Typography>
      </Box>}
    </Box>
  </Stack>;
}

function QuestionTile({ item, current, onClick, tileRef }: { item: QuestionNavigationItem; current: boolean; onClick: () => void; tileRef?: Ref<HTMLButtonElement> }) {
  const status = [item.wrong ? 'answered incorrectly' : item.answered ? 'answered' : 'unanswered', item.flagged ? 'flagged' : undefined].filter(Boolean).join(', ');
  return <ButtonBase
    ref={tileRef}
    onClick={onClick}
    aria-label={`Question ${item.number}, ${status}${current ? ', current question' : ''}`}
    aria-current={current ? 'step' : undefined}
    sx={{
      aspectRatio: '1 / 1',
      width: '100%',
      borderRadius: 1,
      position: 'relative',
      border: '1px solid',
      borderColor: current ? 'primary.main' : item.answered ? '#e6b18d' : '#d9dfe7',
      bgcolor: item.answered ? 'primary.light' : '#fffdfb',
      color: item.answered ? '#853812' : '#4e5e73',
      fontWeight: 750,
      boxShadow: current ? '0 0 0 3px rgba(185, 81, 27, .18)' : 'none',
      '&:hover': { bgcolor: item.answered ? '#efc7ac' : '#f7dfcf' },
      '&:focus-visible': { outline: '3px solid #b9511b', outlineOffset: 2 },
    }}
  >
    {item.number}
    {item.flagged && <FlagRoundedIcon aria-hidden sx={{ position: 'absolute', top: 3, right: 3, fontSize: 13, color: 'error.main' }} />}
    {item.wrong && <ErrorRoundedIcon aria-hidden sx={{ position: 'absolute', right: 3, bottom: 3, fontSize: 14, color: 'error.main' }} />}
  </ButtonBase>;
}
