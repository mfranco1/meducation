import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { alpha, Box, Button, ButtonBase, Card, Chip, IconButton, InputAdornment, LinearProgress, Stack, TextField, Typography, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Topic } from '../../../domain/types';
import { reducedMotion } from '../motion';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';
import { SwapTransition } from '../transitions/SwapTransition';

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

const panelSx = (desktop: boolean): SxProps<Theme> => desktop ? { display: 'flex', flexDirection: 'column', maxHeight: 'min(720px, calc(100dvh - 48px))' } : {};
const scrollSx = (desktop: boolean): SxProps<Theme> => ({ minHeight: 0, p: .5, overflowY: desktop ? 'auto' : undefined });
const topicsHeading = <Typography id="topics-heading" variant="h5" component="h2" sx={{ px: 1, pb: 1 }}>Topics</Typography>;
const nounsOf = (noun: 'quiz' | 'deck') => noun === 'quiz' ? 'quizzes' : 'decks';

function TopicSearch({ nouns, query = '', onQuery, inputRef }: { nouns: string; query?: string; onQuery?: (query: string) => void; inputRef?: RefObject<HTMLInputElement | null> }) {
  return <TextField
    type="search" size="small" placeholder="Search" value={query} inputRef={inputRef} disabled={!onQuery}
    onChange={event => onQuery?.(event.target.value)}
    onKeyDown={event => { if (event.key === 'Escape') onQuery?.(''); }}
    slotProps={{
      htmlInput: { 'aria-label': `Search topics and ${nouns}` },
      input: {
        startAdornment: <InputAdornment position="start"><SearchRoundedIcon aria-hidden fontSize="small" /></InputAdornment>,
        endAdornment: query && <InputAdornment position="end"><IconButton aria-label="Clear search" edge="end" size="small" onClick={() => { onQuery?.(''); inputRef?.current?.focus(); }}><CloseRoundedIcon fontSize="small" /></IconButton></InputAdornment>,
      },
    }}
    // Inset like the topic rows; the browser's own (blue) clear button is replaced by the one above.
    sx={{ display: 'flex', mx: .5, mb: 1, '& input::-webkit-search-cancel-button': { display: 'none' } }}
  />;
}

const trackSx = { height: 6, borderRadius: 3, bgcolor: 'divider', '& .MuiLinearProgress-bar': { borderRadius: 3, [reducedMotion]: { transition: 'none' } } };

/** Case- and accent-insensitive form for substring search. */
const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
  const [query, setQuery] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const topicButtons = useRef(new Map<string, HTMLElement>());
  const returnTo = useRef<string>(undefined);
  const focusPending = useRef(false);
  // On small screens an open topic owns a history entry, so browser Back returns to the topic list.
  const ownsHistoryEntry = useRef(false);
  const withSets = topics.filter(topic => sets.some(set => set.topicId === topic.id));
  const summaries = new Map(withSets.map(topic => {
    const own = sets.filter(set => set.topicId === topic.id);
    return [topic.id, { own, completed: own.filter(set => set.completionCount > 0).length }];
  }));
  const latest = sets.reduce<TopicSet | undefined>((best, set) => set.activityAt && set.activityAt > (best?.activityAt ?? '') ? set : best, undefined);
  const shown = withSets.find(topic => topic.id === selectedId) ?? withSets.find(topic => topic.id === latest?.topicId) ?? withSets[0];
  const selected = desktop || selectedId ? shown : undefined;
  const needle = fold(query.trim());
  const searching = needle !== '';
  const matchingSets = searching ? sets.filter(set => fold(set.name).includes(needle)) : [];
  const listedTopics = searching ? withSets.filter(topic => fold(topic.name).includes(needle) || matchingSets.some(set => set.topicId === topic.id)) : withSets;
  // On small screens the results sit under the topic list; an open topic replaces both.
  const showResults = searching && (desktop || !selected);
  // Narrowing the window keeps the topic that was on screen open instead of returning to the list.
  const [wasDesktop, setWasDesktop] = useState(desktop);
  if (wasDesktop !== desktop) {
    setWasDesktop(desktop);
    if (!desktop) setSelectedId(shown.id);
  }
  const nouns = nounsOf(noun);

  useEffect(() => {
    const onPopState = () => {
      if (!ownsHistoryEntry.current) return;
      ownsHistoryEntry.current = false;
      focusPending.current = true;
      setSelectedId(undefined);
    };
    addEventListener('popstate', onPopState);
    return () => {
      removeEventListener('popstate', onPopState);
      // Leaving the subject from an open topic drops its entry so Back isn't a no-op later.
      if (ownsHistoryEntry.current) history.back();
    };
  }, []);

  useEffect(() => {
    if (desktop || !selectedId || ownsHistoryEntry.current) return;
    history.pushState(history.state, '');
    ownsHistoryEntry.current = true;
  }, [desktop, selectedId]);

  const openTopic = (id: string) => {
    returnTo.current = id;
    focusPending.current = true;
    if (desktop) setQuery('');
    setSelectedId(id);
  };

  // Focus follows the learner's own drill-down, not a window resize.
  useEffect(() => {
    if (desktop || !focusPending.current) return;
    focusPending.current = false;
    if (selectedId) headingRef.current?.focus();
    else if (returnTo.current) topicButtons.current.get(returnTo.current)?.focus();
  }, [desktop, selectedId]);

  const setRow = (set: TopicSet) => <Box component="li" key={set.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px', p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
          {set.completionCount > 0 ? <CheckCircleRoundedIcon aria-hidden color="success" /> : <RadioButtonUncheckedRoundedIcon aria-hidden color="disabled" />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{set.name}</Typography>
            <Typography variant="body2" color="text.secondary">{set.detail}</Typography>
            {(set.completionCount > 0 || set.chips.length > 0 || (set.activityAt && !set.progress)) && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
              {set.completionCount > 0 && <Chip label={`Completed ${set.completionCount} ${set.completionCount === 1 ? 'time' : 'times'}`} size="small" variant="outlined" color="success" sx={{ bgcolor: (theme: Theme) => alpha(theme.palette.success.main, .12) }} />}
              {set.chips.map((chip, index) => <Chip key={index} label={chip} size="small" variant="outlined" />)}
              {set.activityAt && !set.progress && <Typography variant="caption" color="text.secondary">{relativeTime(set.activityAt)}</Typography>}
            </Stack>}
            {set.progress && <Box sx={{ mt: 1.25 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <LinearProgress aria-hidden variant="determinate" value={set.progress.total ? (set.progress.done / set.progress.total) * 100 : 0} sx={{ ...trackSx, flex: 1 }} />
                <Typography variant="body2" color="text.secondary">{set.progress.total ? Math.round((set.progress.done / set.progress.total) * 100) : 0}%</Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">{`${set.progress.done}/${set.progress.total} ${set.progress.label}`}</Typography>
                {set.activityAt && <Typography variant="caption" color="text.secondary">{relativeTime(set.activityAt)}</Typography>}
              </Stack>
            </Box>}
          </Box>
        </Stack>
        <Box sx={{ flex: '0 0 auto' }}>{set.action}</Box>
      </Stack>
  </Box>;

  const topicsCard = <Card component="section" aria-labelledby="topics-heading" sx={{ p: 2, ...panelSx(desktop) }}>
    {topicsHeading}
    <TopicSearch nouns={nouns} query={query} onQuery={setQuery} inputRef={searchRef} />
    <Box role="status" aria-live="polite" sx={visuallyHidden}>{searching && `${count(listedTopics.length, 'topic', 'topics')}, ${count(matchingSets.length, noun, nouns)}`}</Box>
    <Stack component="ul" spacing={.5} sx={{ listStyle: 'none', m: 0, ...scrollSx(desktop) }}>
      {listedTopics.map(topic => {
        const summary = summaries.get(topic.id)!;
        const isSelected = !searching && topic.id === selected?.id;
        const matches = matchingSets.filter(set => set.topicId === topic.id).length;
        return <li key={topic.id}><ButtonBase
          ref={(node: HTMLElement | null) => { if (node) topicButtons.current.set(topic.id, node); else topicButtons.current.delete(topic.id); }}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => openTopic(topic.id)}
          sx={{ alignItems: 'center', borderRadius: '10px', display: 'flex', gap: 1.5, p: 1.5, textAlign: 'left', width: '100%', bgcolor: isSelected ? 'primary.light' : 'transparent', '&:hover': { bgcolor: isSelected ? 'primary.light' : 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{topic.name}</Typography>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: .75 }}>
              <LinearProgress aria-hidden variant="determinate" value={(summary.completed / summary.own.length) * 100} sx={{ ...trackSx, flex: 1 }} />
              <Typography variant="caption" color="text.secondary">{summary.completed}/{summary.own.length}</Typography>
            </Stack>
            {matches > 0 && <Typography variant="caption" color="text.secondary">{`${matches} matching ${matches === 1 ? noun : nouns}`}</Typography>}
          </Box>
          <ChevronRightRoundedIcon aria-hidden color="action" />
        </ButtonBase></li>;
      })}
    </Stack>
  </Card>;

  const content = selected && (() => {
    const { own, completed } = summaries.get(selected.id)!;
    const percent = Math.round((completed / own.length) * 100);
    return <Card component="section" aria-labelledby="topic-summary-heading" sx={{ p: 2.5, minWidth: 0, ...panelSx(desktop) }}>
      {!desktop && <Button startIcon={<ArrowBackRoundedIcon />} color="inherit" onClick={() => history.back()} sx={{ mb: 1.5 }}>Topics</Button>}
      <Typography ref={headingRef} tabIndex={-1} id="topic-summary-heading" variant="h5" component="h2" sx={{ overflowWrap: 'anywhere', outline: 'none' }}>{selected.name}</Typography>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
        <LinearProgress aria-hidden variant="determinate" value={percent} sx={{ ...trackSx, flex: 1 }} />
        <Typography variant="body2" color="text.secondary">{percent}%</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{`${completed} of ${own.length} ${nouns} completed`}</Typography>
      <Box sx={{ height: '1px', bgcolor: '#eee5df', opacity: .8, my: 2.5 }} />
      <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>{noun === 'quiz' ? 'Quizzes' : 'Decks'}</Typography>
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, ...scrollSx(desktop) }}>
        {own.map(setRow)}
      </Stack>
    </Card>;
  })();

  const resultsCard = <Card component="section" aria-labelledby="results-heading" sx={{ p: 2.5, minWidth: 0, ...panelSx(desktop) }}>
    <Typography id="results-heading" variant="h5" component="h2" sx={{ mb: 1.5 }}>Results</Typography>
    {listedTopics.length === 0 ? <Stack alignItems="flex-start" spacing={1}>
      <Typography color="text.secondary">{`No topics or ${nouns} match “${query.trim()}”`}</Typography>
      <Button variant="contained" onClick={() => setQuery('')}>Clear</Button>
    </Stack> : matchingSets.length === 0 ? <Typography color="text.secondary">{`No matching ${nouns}`}</Typography> : <Stack spacing={2.5} sx={scrollSx(desktop)}>
      {listedTopics.filter(topic => matchingSets.some(set => set.topicId === topic.id)).map(topic => <Box key={topic.id}>
        <Typography variant="h6" component="h3" sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>{topic.name}</Typography>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>{matchingSets.filter(set => set.topicId === topic.id).map(setRow)}</Stack>
      </Box>)}
    </Stack>}
  </Card>;

  return desktop
    ? <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>{topicsCard}<SwapTransition swapKey={showResults ? 'results' : selected?.id ?? 'topics'}>{showResults ? resultsCard : content}</SwapTransition></Box>
    // One stable wrapper keeps the search field mounted, and focused, as results appear.
    : <SwapTransition swapKey={selected?.id ?? 'topics'} direction={selected ? 1 : -1}>{content || <Stack spacing={3}>{topicsCard}{showResults && resultsCard}</Stack>}</SwapTransition>;
}

const rowWidths = ['62%', '78%', '54%', '70%', '46%', '66%'];

export function TopicSetBrowserSkeleton({ noun, dashed = false }: { noun: 'quiz' | 'deck'; dashed?: boolean }) {
  const desktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'));
  const border = dashed ? '1px dashed' : '1px solid';
  const topicsCard = <Card component="section" aria-labelledby="topics-heading" sx={{ p: 2, ...panelSx(desktop) }}>
    {topicsHeading}
    <TopicSearch nouns={nounsOf(noun)} />
    <Stack component="ul" aria-hidden spacing={.5} sx={{ listStyle: 'none', m: 0, ...scrollSx(desktop) }}>
      {rowWidths.map((width, index) => <Box component="li" key={index} sx={{ alignItems: 'center', display: 'flex', gap: 1.5, p: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <LoadingSkeleton variant="text" width={width} height={22} />
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: .75 }}>
            <Box sx={{ flex: 1 }}><LoadingSkeleton variant="rounded" height={6} sx={{ borderRadius: 3 }} /></Box>
            <LoadingSkeleton variant="text" width={24} height={16} />
          </Stack>
        </Box>
        <ChevronRightRoundedIcon color="disabled" />
      </Box>)}
    </Stack>
  </Card>;
  if (!desktop) return topicsCard;
  return <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>
    {topicsCard}
    <Card component="section" sx={{ p: 2.5, minWidth: 0, ...panelSx(desktop) }}>
      <Box aria-hidden>
        <LoadingSkeleton variant="text" width="40%" height={32} />
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
          <Box sx={{ flex: 1 }}><LoadingSkeleton variant="rounded" height={6} sx={{ borderRadius: 3 }} /></Box>
          <LoadingSkeleton variant="text" width={32} height={20} />
        </Stack>
        <Box sx={{ mt: .75 }}><LoadingSkeleton variant="text" width="30%" height={20} /></Box>
      </Box>
      <Box sx={{ height: '1px', bgcolor: '#eee5df', opacity: .8, my: 2.5 }} />
      <Typography variant="h6" component="h3" sx={{ mb: 1.5 }}>{noun === 'quiz' ? 'Quizzes' : 'Decks'}</Typography>
      <Stack component="ul" aria-hidden spacing={1.5} sx={{ listStyle: 'none', m: 0, ...scrollSx(desktop) }}>
        {[0, 1, 2, 3].map(index => <Box component="li" key={index} sx={{ border, borderColor: 'divider', borderRadius: '10px', p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ flex: '0 0 auto', display: 'flex' }}><LoadingSkeleton variant="circular" width={24} height={24} /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <LoadingSkeleton variant="text" width="55%" height={28} />
                <LoadingSkeleton variant="text" width="25%" height={20} />
              </Box>
            </Stack>
            <Box sx={{ flex: '0 0 auto', display: 'flex' }}><LoadingSkeleton variant="rounded" width={88} height={36} /></Box>
          </Stack>
        </Box>)}
      </Stack>
    </Card>
  </Box>;
}
