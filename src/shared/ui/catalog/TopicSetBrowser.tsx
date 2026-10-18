import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { alpha, Box, Button, ButtonBase, Card, Chip, LinearProgress, Stack, Typography, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Topic } from '../../../domain/types';
import { reducedMotion } from '../motion';

export interface TopicSet {
  id: string;
  topicId: string;
  name: string;
  detail: string;
  completionCount: number;
  progress?: { done: number; total: number; label: 'answered' | 'reviewed' };
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
  const desktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const [selectedId, setSelectedId] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topicButtons = useRef(new Map<string, HTMLElement>());
  const returnTo = useRef<string>(undefined);
  const withSets = topics.filter(topic => sets.some(set => set.topicId === topic.id));
  const summaries = new Map(withSets.map(topic => {
    const own = sets.filter(set => set.topicId === topic.id);
    return [topic.id, { own, completed: own.filter(set => set.completionCount > 0).length }];
  }));
  const latest = sets.reduce<TopicSet | undefined>((best, set) => set.activityAt && set.activityAt > (best?.activityAt ?? '') ? set : best, undefined);
  const chosen = withSets.find(topic => topic.id === selectedId);
  const selected = chosen ?? (desktop ? withSets.find(topic => topic.id === latest?.topicId) ?? withSets[0] : undefined);
  const panelSx: SxProps<Theme> = desktop ? { display: 'flex', flexDirection: 'column', maxHeight: 'min(720px, calc(100dvh - 48px))' } : {};
  const scrollSx: SxProps<Theme> = { minHeight: 0, p: .5, overflowY: desktop ? 'auto' : undefined };
  const nouns = noun === 'quiz' ? 'quizzes' : 'decks';

  useEffect(() => {
    if (desktop) return;
    if (selectedId) headingRef.current?.focus();
    else if (returnTo.current) topicButtons.current.get(returnTo.current)?.focus();
  }, [desktop, selectedId]);

  const topicsCard = <Card component="section" aria-labelledby="topics-heading" sx={{ p: 2, ...panelSx }}>
    <Typography id="topics-heading" variant="h5" component="h2" sx={{ px: 1, pb: 1 }}>Topics</Typography>
    <Stack component="ul" spacing={.5} sx={{ listStyle: 'none', m: 0, ...scrollSx }}>
      {withSets.map(topic => {
        const summary = summaries.get(topic.id)!;
        const isSelected = topic.id === selected?.id;
        return <li key={topic.id}><ButtonBase
          ref={(node: HTMLElement | null) => { if (node) topicButtons.current.set(topic.id, node); else topicButtons.current.delete(topic.id); }}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => { returnTo.current = topic.id; setSelectedId(topic.id); }}
          sx={{ alignItems: 'center', borderRadius: '10px', display: 'flex', gap: 1.5, p: 1.5, textAlign: 'left', width: '100%', bgcolor: isSelected ? 'primary.light' : 'transparent', '&:hover': { bgcolor: isSelected ? 'primary.light' : 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{topic.name}</Typography>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: .75 }}>
              <LinearProgress aria-hidden variant="determinate" value={(summary.completed / summary.own.length) * 100} sx={{ ...trackSx, flex: 1 }} />
              <Typography variant="caption" color="text.secondary">{summary.completed}/{summary.own.length}</Typography>
            </Stack>
          </Box>
          <ChevronRightRoundedIcon aria-hidden color="action" />
        </ButtonBase></li>;
      })}
    </Stack>
  </Card>;

  const content = selected && (() => {
    const { own, completed } = summaries.get(selected.id)!;
    const percent = Math.round((completed / own.length) * 100);
    return <Card component="section" aria-labelledby="topic-summary-heading" sx={{ p: 2.5, minWidth: 0, ...panelSx }}>
      {!desktop && <Button startIcon={<ArrowBackRoundedIcon />} color="inherit" onClick={() => setSelectedId(undefined)} sx={{ mb: 1.5 }}>All topics</Button>}
      <Typography ref={headingRef} tabIndex={-1} id="topic-summary-heading" variant="h5" component="h2" sx={{ overflowWrap: 'anywhere', outline: 'none' }}>{selected.name}</Typography>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
        <LinearProgress aria-hidden variant="determinate" value={percent} sx={{ ...trackSx, flex: 1 }} />
        <Typography variant="body2" color="text.secondary">{percent}%</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{`${completed} of ${own.length} ${nouns} completed`}</Typography>
      <Box sx={{ height: '1px', bgcolor: '#eee5df', opacity: .8, my: 2.5 }} />
      <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>{noun === 'quiz' ? 'Quizzes' : 'Decks'}</Typography>
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, ...scrollSx }}>
        {own.map(set => <Box component="li" key={set.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px', p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
              {set.completionCount > 0 ? <CheckCircleRoundedIcon aria-hidden color="success" /> : <RadioButtonUncheckedRoundedIcon aria-hidden color="disabled" />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{set.name}</Typography>
                <Typography variant="body2" color="text.secondary">{set.detail}</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                  {set.completionCount > 0 && <Chip label={`Completed ${set.completionCount} ${set.completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" color="success" sx={{ bgcolor: (theme: Theme) => alpha(theme.palette.success.main, .12) }} />}
                  {set.chips.map((chip, index) => <Chip key={index} label={chip} size="small" variant="outlined" />)}
                  {set.activityAt && <Typography variant="caption" color="text.secondary">{relativeTime(set.activityAt)}</Typography>}
                </Stack>
                {set.progress && <Box sx={{ mt: 1.25 }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <LinearProgress aria-hidden variant="determinate" value={set.progress.total ? (set.progress.done / set.progress.total) * 100 : 0} sx={{ ...trackSx, flex: 1 }} />
                    <Typography variant="body2" color="text.secondary">{set.progress.total ? Math.round((set.progress.done / set.progress.total) * 100) : 0}%</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{`${set.progress.done}/${set.progress.total} ${set.progress.label}`}</Typography>
                </Box>}
              </Box>
            </Stack>
            <Box sx={{ flex: '0 0 auto' }}>{set.action}</Box>
          </Stack>
        </Box>)}
      </Stack>
    </Card>;
  })();

  return desktop
    ? <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>{topicsCard}{content}</Box>
    : content || topicsCard;
}
