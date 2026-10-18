import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { Box, ButtonBase, Card, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import type { Topic } from '../../../domain/types';
import { reducedMotion } from '../motion';

export interface TopicSet {
  id: string;
  topicId: string;
  name: string;
  detail: string;
  completed: boolean;
  chips: ReactNode[];
  activityAt?: string;
  action: ReactNode;
}

const trackSx = { height: 6, borderRadius: 3, bgcolor: 'divider', '& .MuiLinearProgress-bar': { borderRadius: 3, [reducedMotion]: { transition: 'none' } } };

/** Relative to now, in the largest whole unit ("2 days ago"). */
function relativeTime(iso: string): string {
  const seconds = Math.min(0, (Date.parse(iso) - Date.now()) / 1000);
  const units = [['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]] as const;
  const [unit, size] = units.find(([, size]) => -seconds >= size) ?? ['minute', 60];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / size) || 0, unit);
}

export function TopicSetBrowser({ topics, sets, noun }: { topics: readonly Topic[]; sets: readonly TopicSet[]; noun: 'quiz' | 'deck' }) {
  const [selectedId, setSelectedId] = useState<string>();
  const withSets = topics.filter(topic => sets.some(set => set.topicId === topic.id));
  const summaries = new Map(withSets.map(topic => {
    const own = sets.filter(set => set.topicId === topic.id);
    return [topic.id, { own, completed: own.filter(set => set.completed).length }];
  }));
  const latest = sets.reduce<TopicSet | undefined>((best, set) => set.activityAt && set.activityAt > (best?.activityAt ?? '') ? set : best, undefined);
  const selected = withSets.find(topic => topic.id === selectedId) ?? withSets.find(topic => topic.id === latest?.topicId) ?? withSets[0];
  const { own, completed } = summaries.get(selected.id)!;
  const percent = Math.round((completed / own.length) * 100);
  const nouns = noun === 'quiz' ? 'quizzes' : 'decks';

  return <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(300px, 380px) minmax(0, 1fr)' } }}>
    <Card component="section" aria-labelledby="topics-heading" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ px: 1, pb: 1 }}>
        <Typography id="topics-heading" variant="h6" component="h2">Topics</Typography>
        <Typography variant="body2" color="text.secondary">{withSets.length} {withSets.length === 1 ? 'topic' : 'topics'}</Typography>
      </Stack>
      <Stack component="ul" spacing={.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {withSets.map(topic => {
          const summary = summaries.get(topic.id)!;
          const isSelected = topic.id === selected.id;
          return <li key={topic.id}><ButtonBase
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => setSelectedId(topic.id)}
            sx={{ alignItems: 'center', borderRadius: '10px', display: 'flex', gap: 1.5, p: 1.5, textAlign: 'left', width: '100%', bgcolor: isSelected ? 'primary.light' : 'transparent', '&:hover': { bgcolor: isSelected ? 'primary.light' : 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>{topic.name}</Typography>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: .75 }}>
                <LinearProgress aria-hidden variant="determinate" value={(summary.completed / summary.own.length) * 100} sx={{ ...trackSx, flex: 1 }} />
                <Typography variant="caption" color="text.secondary">{summary.completed}/{summary.own.length}</Typography>
              </Stack>
            </Box>
            <ChevronRightRoundedIcon aria-hidden color="action" />
          </ButtonBase></li>;
        })}
      </Stack>
    </Card>

    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <Card component="section" aria-labelledby="topic-summary-heading" sx={{ p: 2.5 }}>
        <Typography id="topic-summary-heading" variant="h5" component="h2" sx={{ overflowWrap: 'anywhere' }}>{selected.name}</Typography>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
          <LinearProgress aria-hidden variant="determinate" value={percent} sx={{ ...trackSx, flex: 1 }} />
          <Typography variant="body2" color="text.secondary">{percent}%</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{`${completed} of ${own.length} ${nouns} completed`}</Typography>
      </Card>
      <Box component="section" aria-labelledby="topic-sets-heading">
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
          <Typography id="topic-sets-heading" variant="h6" component="h2">{noun === 'quiz' ? 'Quiz sets' : 'Decks'}</Typography>
          <Typography variant="body2" color="text.secondary">{`${own.length} ${own.length === 1 ? noun : nouns}`}</Typography>
        </Stack>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {own.map(set => <Card component="li" key={set.id} sx={{ borderRadius: '10px', p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                {set.completed ? <CheckCircleRoundedIcon aria-hidden color="primary" /> : <RadioButtonUncheckedRoundedIcon aria-hidden color="disabled" />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{set.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{set.detail}</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                    {set.chips.map((chip, index) => <Chip key={index} label={chip} size="small" variant="outlined" />)}
                    {set.activityAt && <Typography variant="caption" color="text.secondary">{relativeTime(set.activityAt)}</Typography>}
                  </Stack>
                </Box>
              </Stack>
              <Box sx={{ flex: '0 0 auto' }}>{set.action}</Box>
            </Stack>
          </Card>)}
        </Stack>
      </Box>
    </Stack>
  </Box>;
}
