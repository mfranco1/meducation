import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import { Box, ButtonBase, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { Attempt, Question } from '../../../domain/types';

export type QuestionNavigatorFilter = 'all' | 'unanswered' | 'flagged';

export interface QuestionNavigationItem {
  index: number;
  number: number;
  answered: boolean;
  flagged: boolean;
}

export function questionNavigationItems(questions: Question[], attempt: Attempt): QuestionNavigationItem[] {
  return questions.map((question, index) => {
    const response = attempt.responses[question.id];
    return {
      index,
      number: question.questionNumber ?? index + 1,
      answered: Boolean(response?.selectedChoiceId),
      flagged: Boolean(response?.flagged),
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

  return <Stack spacing={2} aria-label="Question navigator">
    <ToggleButtonGroup
      value={filter}
      exclusive
      fullWidth
      size="small"
      aria-label="Filter questions"
      onChange={(_, value: QuestionNavigatorFilter | null) => { if (value) onFilterChange(value); }}
    >
      <ToggleButton value="all" aria-label={`All questions, ${items.length}`}>All <Box component="span" sx={{ ml: .5 }}>{items.length}</Box></ToggleButton>
      <ToggleButton value="unanswered" aria-label={`Unanswered questions, ${unanswered}`}>Open <Box component="span" sx={{ ml: .5 }}>{unanswered}</Box></ToggleButton>
      <ToggleButton value="flagged" aria-label={`Flagged questions, ${flagged}`}>Flagged <Box component="span" sx={{ ml: .5 }}>{flagged}</Box></ToggleButton>
    </ToggleButtonGroup>
    <Box sx={{ overflowY: 'auto', maxHeight: { xs: 'calc(100vh - 230px)', md: 470 }, pr: .5 }}>
      {visibleItems.length ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1 }}>
        {visibleItems.map(item => <QuestionTile key={item.index} item={item} current={item.index === currentIndex} onClick={() => onNavigate(item.index)} />)}
      </Box> : <Box sx={{ py: 5, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="body2" color="text.secondary">{filter === 'flagged' ? 'No flagged questions.' : 'No unanswered questions.'}</Typography>
      </Box>}
    </Box>
  </Stack>;
}

function QuestionTile({ item, current, onClick }: { item: QuestionNavigationItem; current: boolean; onClick: () => void }) {
  const status = [item.answered ? 'answered' : 'unanswered', item.flagged ? 'flagged' : undefined].filter(Boolean).join(', ');
  return <ButtonBase
    onClick={onClick}
    aria-label={`Question ${item.number}, ${status}${current ? ', current question' : ''}`}
    aria-current={current ? 'step' : undefined}
    sx={{
      aspectRatio: '1 / 1',
      width: '100%',
      borderRadius: 1,
      position: 'relative',
      border: '1px solid',
      borderColor: current ? 'primary.main' : item.answered ? '#473b35' : '#d9dfe7',
      bgcolor: item.answered ? '#473b35' : '#fffdfb',
      color: item.answered ? '#fffdfb' : '#4e5e73',
      fontWeight: 750,
      boxShadow: current ? '0 0 0 3px rgba(185, 81, 27, .18)' : 'none',
      '&:hover': { bgcolor: item.answered ? '#352b27' : '#f7dfcf' },
      '&:focus-visible': { outline: '3px solid #b9511b', outlineOffset: 2 },
    }}
  >
    {item.number}
    {item.flagged && <FlagRoundedIcon aria-hidden sx={{ position: 'absolute', top: 3, right: 3, fontSize: 13, color: item.answered ? '#f7dfcf' : 'primary.main' }} />}
  </ButtonBase>;
}
