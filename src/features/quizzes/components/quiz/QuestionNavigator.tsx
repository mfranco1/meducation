import { useRef, type Ref } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { isCorrect } from '../../../../domain/quizEngine';
import type { Attempt, Question } from '../../../../domain/types';
import { useScrollCurrentQuestion } from '../../../../shared/ui/study/useScrollCurrentQuestion';
import { StudyNavigatorEmpty, StudyNavigatorTile } from '../../../../shared/ui/study/StudyNavigatorTile';

export type QuestionNavigatorFilter = 'all' | 'unanswered' | 'wrong' | 'flagged';
export type QuestionNavigatorFilterSet = 'quiz' | 'review';

export interface QuestionNavigationItem {
  index: number;
  number: number;
  answered: boolean;
  flagged: boolean;
  correct: boolean;
  wrong: boolean;
}

export function questionNavigationItems(
  questions: Question[],
  attempt: Attempt,
  revealAnswers = false,
): QuestionNavigationItem[] {
  return questions.map((question, index) => {
    const response = attempt.responses[question.id];
    const graded =
      (attempt.feedbackMode === 'immediate' || revealAnswers) &&
      response?.selectedChoiceId &&
      (revealAnswers || response.locked);
    const correct = graded ? isCorrect(question, response.selectedChoiceId) : undefined;
    return {
      index,
      number: index + 1,
      answered: Boolean(response?.selectedChoiceId),
      flagged: Boolean(response?.flagged),
      correct: correct === true,
      wrong: correct === false,
    };
  });
}

export function filterQuestionNavigationItems(items: QuestionNavigationItem[], filter: QuestionNavigatorFilter) {
  if (filter === 'unanswered') return items.filter((item) => !item.answered);
  if (filter === 'wrong') return items.filter((item) => item.wrong);
  if (filter === 'flagged') return items.filter((item) => item.flagged);
  return items;
}

export function adjacentQuestionIndexes(
  items: QuestionNavigationItem[],
  filter: QuestionNavigatorFilter,
  currentIndex: number,
): { previous?: number; next?: number } {
  const filtered = filterQuestionNavigationItems(items, filter);
  const visible = filtered.length > 0 ? filtered : items;
  return {
    previous: visible.filter((item) => item.index < currentIndex).at(-1)?.index,
    next: visible.find((item) => item.index > currentIndex)?.index,
  };
}

interface QuestionNavigatorProps {
  questions: Question[];
  attempt: Attempt;
  currentIndex: number;
  filter: QuestionNavigatorFilter;
  onFilterChange: (filter: QuestionNavigatorFilter) => void;
  onNavigate: (index: number) => void;
  revealAnswers?: boolean;
  filterSet?: QuestionNavigatorFilterSet;
  finishLabel: string;
  onFinish: () => void;
}

export function QuestionNavigator({
  questions,
  attempt,
  currentIndex,
  filter,
  onFilterChange,
  onNavigate,
  revealAnswers = false,
  filterSet = 'quiz',
  finishLabel,
  onFinish,
}: QuestionNavigatorProps) {
  const items = questionNavigationItems(questions, attempt, revealAnswers);
  const visibleItems = filterQuestionNavigationItems(items, filter);
  const unanswered = items.filter((item) => !item.answered).length;
  const flagged = items.filter((item) => item.flagged).length;
  const wrong = items.filter((item) => item.wrong).length;
  const filters = [
    { value: 'all', label: 'All', accessibleLabel: `All questions, ${items.length}` },
    filterSet === 'review'
      ? { value: 'wrong', label: 'Wrong', accessibleLabel: `Wrong questions, ${wrong}` }
      : { value: 'unanswered', label: 'Open', accessibleLabel: `Unanswered questions, ${unanswered}` },
    { value: 'flagged', label: 'Flagged', accessibleLabel: `Flagged questions, ${flagged}` },
  ];
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLButtonElement>(null);

  useScrollCurrentQuestion(scrollAreaRef, currentTileRef, [currentIndex, filter]);

  return (
    <Stack spacing={2} aria-label="Question navigator">
      <ToggleButtonGroup
        value={filter}
        exclusive
        fullWidth
        size="small"
        aria-label="Filter questions"
        onChange={(_, value: QuestionNavigatorFilter | null) => {
          if (value) onFilterChange(value);
        }}
      >
        {filters.map((item) => (
          <ToggleButton
            key={item.value}
            value={item.value}
            aria-label={item.accessibleLabel}
            sx={{ borderRadius: '10px' }}
          >
            {item.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Box ref={scrollAreaRef} sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 170px)', md: 470 }, p: 1 }}>
        {visibleItems.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1 }}>
            {visibleItems.map((item) => (
              <QuestionTile
                key={item.index}
                item={item}
                current={item.index === currentIndex}
                tileRef={item.index === currentIndex ? currentTileRef : undefined}
                onClick={() => onNavigate(item.index)}
              />
            ))}
          </Box>
        ) : (
          <StudyNavigatorEmpty>
            {filter === 'flagged'
              ? 'No flagged questions.'
              : filter === 'wrong'
                ? 'No wrong answers.'
                : 'No unanswered questions.'}
          </StudyNavigatorEmpty>
        )}
      </Box>
      <Button variant="contained" fullWidth onClick={onFinish}>
        {finishLabel}
      </Button>
    </Stack>
  );
}

export function QuestionTile({
  item,
  current,
  onClick,
  tileRef,
  showAnswerStatus = true,
  itemLabel = 'Question',
}: {
  item: QuestionNavigationItem;
  current: boolean;
  onClick: () => void;
  tileRef?: Ref<HTMLButtonElement>;
  showAnswerStatus?: boolean;
  itemLabel?: string;
}) {
  const status = showAnswerStatus
    ? [
        item.wrong
          ? 'answered incorrectly'
          : item.correct
            ? 'answered correctly'
            : item.answered
              ? 'answered'
              : 'unanswered',
        item.flagged ? 'flagged' : undefined,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return (
    <StudyNavigatorTile
      number={item.number}
      label={itemLabel}
      current={current}
      highlighted={item.answered}
      flagged={item.flagged}
      result={item.wrong ? 'incorrect' : item.correct ? 'correct' : undefined}
      status={status}
      onClick={onClick}
      tileRef={tileRef}
    />
  );
}
