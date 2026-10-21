import { MenuItem, TextField } from '@mui/material';
import type { TopicFilter } from '../core/navigator';

const OPTIONS: [TopicFilter, string][] = [
  ['all', 'All topics'],
  ['empty', 'Empty topics'],
  ['quizzes', 'Quizzes only'],
  ['flashcards', 'Flashcards only'],
  ['both', 'Quizzes and flashcards'],
];

export const topicTotals = (row: { items: number; cards: number }) => `${row.items} items · ${row.cards} cards`;

export function AdminTopicFilter({ value, onChange }: { value: TopicFilter; onChange: (value: TopicFilter) => void }) {
  return (
    <TextField
      select
      size="small"
      label="Show topics"
      value={value}
      onChange={(event) => onChange(event.target.value as TopicFilter)}
    >
      {OPTIONS.map(([option, label]) => (
        <MenuItem key={option} value={option}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  );
}
