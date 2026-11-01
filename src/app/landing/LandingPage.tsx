import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { keyframes } from '@emotion/react';
import { alpha, Box, Button, ClickAwayListener, IconButton, Tooltip, Typography } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import { AppBrand } from '../../shared/ui/brand/AppBrand';
import { SubjectIcon } from '../../shared/ui/catalog/icons/SubjectIcon';
import { LegalFooter } from '../../shared/ui/catalog/LegalFooter';
import { easing, reducedMotion } from '../../shared/ui/motion';
import { theme } from '../../shared/theme';
import { SampleCases } from './SampleCases';
import { SampleFlashcards } from './SampleFlashcards';
import { useSampleActive } from './useSampleActive';
import { hairline, type } from './typography';
import samples from './samples.json';

const grid = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' }, columnGap: 3 } as const;
const section = { ...grid, py: { xs: 6, md: 10 }, borderTop: hairline } as const;

const successMain = theme.palette.success.main;

const notes = ['Choose an answer', 'Read the explanation', 'Celebrate your progress'];

const stepPulse = keyframes`
  0% { transform: scale(1); box-shadow: 0 0 0 0 ${alpha(successMain, .4)}; }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); box-shadow: 0 0 0 10px ${alpha(successMain, 0)}; }
`;

function StepHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return <ClickAwayListener onClickAway={() => setOpen(false)}>
    <Tooltip title={text} describeChild open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
      <IconButton aria-label={label} size="small" onClick={() => setOpen(true)} sx={{ ml: .5, p: .25, verticalAlign: 'middle', color: 'text.secondary' }}>
        <HelpOutlineRoundedIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  </ClickAwayListener>;
}

/** Numbered circles joined by a line. Completed steps show green checks with one pulse. */
function Steps({ items, label, done = 0, completed, hints, sx }: { items: string[]; label?: string; done?: number; completed?: ReadonlySet<number>; hints?: Partial<Record<number, string>>; sx?: object }) {
  return <Box component="ol" aria-label={label} sx={{ listStyle: 'none', p: 0, m: 0, ...sx }}>
    {items.map((item, position) => {
      const complete = completed ? completed.has(position + 1) : position < done;
      return <Box component="li" key={item} sx={{
        position: 'relative', display: 'grid', gridTemplateColumns: '32px 1fr', columnGap: 2, alignItems: 'start',
        '&:not(:last-of-type)': { pb: 3 },
        '&:not(:last-of-type)::after': { content: '""', position: 'absolute', left: 15.5, top: 32, bottom: 0, borderLeft: '1px solid', borderColor: complete ? 'success.main' : 'feedback.choiceBorder', transition: 'border-color 300ms ease-out' },
      }}>
        <Box component="span" aria-hidden sx={{
          display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', border: '1.5px solid', fontSize: '.875rem', fontWeight: 750, fontVariantNumeric: 'tabular-nums',
          borderColor: complete ? 'success.main' : 'text.primary', bgcolor: complete ? 'feedback.correct.surface' : 'background.paper', color: complete ? 'success.dark' : 'text.primary',
          transition: 'border-color 300ms ease-out, background-color 300ms ease-out, color 300ms ease-out',
          animation: complete ? `${stepPulse} 600ms ${easing.out}` : undefined, [reducedMotion]: { transition: 'none', animation: 'none' },
        }}>{complete ? <CheckRoundedIcon sx={{ fontSize: 20 }} /> : position + 1}</Box>
        <Typography sx={{ ...type.body, pt: '4px' }}>{item}{complete && <Box component="span" sx={visuallyHidden}> (done)</Box>}{hints?.[position + 1] && <StepHint text={hints[position + 1]!} label={`Hint for ${item}`} />}</Typography>
      </Box>;
    })}
  </Box>;
}

function SectionHead({ label, title, id, children }: { label: string; title: string; id: string; children?: ReactNode }) {
  return <Box>
    <Typography sx={{ ...type.label, mb: { xs: 1.5, md: 2 } }}>{label}</Typography>
    <Typography component="h2" id={id} sx={type.section}>{title}</Typography>
    {children}
  </Box>;
}

export function LandingPage({ onStart }: { onStart: () => void }) {
  const heroCta = useRef<HTMLButtonElement>(null);
  const closingCta = useRef<HTMLButtonElement>(null);
  const quizSection = useRef<HTMLElement>(null);
  const flashcardSection = useRef<HTMLElement>(null);
  const quizActive = useSampleActive(quizSection);
  const flashcardsActive = useSampleActive(flashcardSection);
  const [stepsDone, setStepsDone] = useState(0);
  const completeStep = useCallback((step: number) => setStepsDone(current => Math.max(current, step)), []);
  const [flashcardSteps, setFlashcardSteps] = useState<ReadonlySet<number>>(new Set());
  const completeFlashcardStep = useCallback((step: number) => setFlashcardSteps(current => current.has(step) ? current : new Set(current).add(step)), []);
  const [ctaInView, setCtaInView] = useState({ hero: true, closing: false });

  // The phone layout keeps Start studying within thumb reach once the hero button scrolls away.
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setCtaInView(current => {
      const next = { ...current };
      entries.forEach(entry => { next[entry.target === heroCta.current ? 'hero' : 'closing'] = entry.isIntersecting; });
      return next;
    }));
    [heroCta.current, closingCta.current].forEach(element => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const showBar = !ctaInView.hero && !ctaInView.closing;

  return <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100dvh', pb: { xs: 11, md: 0 } }}>
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3, md: 4 } }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: { xs: 1.5, md: 2 }, borderBottom: '2px solid', borderColor: 'text.primary' }}>
        <AppBrand size={{ xs: 132, md: 156 }} />
        <Button variant="contained" onClick={onStart} sx={{ flexShrink: 0 }}>Start studying</Button>
      </Box>

      <Box component="main">
        <Box component="section" aria-labelledby="hero-title" sx={{ position: 'relative', isolation: 'isolate', display: 'flex', alignItems: 'center', minHeight: { md: 720, lg: 800 }, pt: { xs: 5, md: 10 }, pb: { xs: 46, sm: 58, md: 10 } }}>
          <Box sx={{ position: 'relative', zIndex: 1, width: { xs: '100%', md: '52%' }, textAlign: { xs: 'center', md: 'left' } }}>
            <Typography sx={{ ...type.label, color: 'primary.main', mb: { xs: 2, md: 3 } }}>Review · Practice · Improve</Typography>
            <Typography component="h1" id="hero-title" sx={{ ...type.display, maxWidth: '18ch', mx: { xs: 'auto', md: 0 } }}>Study medicine one question at a time</Typography>
            <Typography sx={{ ...type.lede, mt: { xs: 2, md: 3 }, mx: { xs: 'auto', md: 0 } }}>
              Practice quizzes and flashcards across twelve subjects without an account for free
            </Typography>
            <Button ref={heroCta} variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} onClick={onStart} sx={{ mt: { xs: 3, md: 4 }, px: 3.5, py: 1.75, fontSize: '1.0625rem', gap: 1 }}>Start studying</Button>
            <Box component="nav" aria-label="Explore study tools" sx={{ display: 'flex', maxWidth: 360, mx: { xs: 'auto', md: 0 }, mt: { xs: 3, md: 4 }, '& > :not(:first-of-type)': { borderLeft: hairline } }}>
              {[
                { label: 'Quizzes', href: '#quizzes', Icon: QuizOutlinedIcon },
                { label: 'Flashcards', href: '#flashcards', Icon: StyleOutlinedIcon },
                { label: 'Subjects', href: '#subjects', Icon: LayersOutlinedIcon },
              ].map(({ label, href, Icon }) => <Button key={href} href={href} sx={{ flex: 1, minWidth: 0, flexDirection: 'column', gap: .75, px: 1, py: .75, borderRadius: 0, color: 'text.primary', fontSize: '.8125rem', whiteSpace: 'nowrap' }}>
                <Box component="span" sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '10px', bgcolor: theme => alpha(theme.palette.primary.main, .08), color: 'primary.main' }}><Icon sx={{ fontSize: 20 }} /></Box>
                {label}
              </Button>)}
            </Box>
          </Box>
          <Box aria-hidden sx={{ position: 'absolute', zIndex: -1, insetInline: { xs: -16, sm: -24, md: -32 }, bottom: 0, height: { xs: 360, sm: 440, md: '100%' }, pointerEvents: 'none' }}>
            <Box component="img" src="/assets/illustrations/landing-hero-960.webp" srcSet="/assets/illustrations/landing-hero-640.webp 640w, /assets/illustrations/landing-hero-960.webp 960w, /assets/illustrations/landing-hero-1440.webp 1440w" sizes="(min-width: 1200px) 1200px, 100vw" width={1448} height={1086} alt="" loading="eager" fetchPriority="high" decoding="async" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} />
            <Box sx={{ position: 'absolute', inset: 0, background: theme => ({ xs: `linear-gradient(to bottom, ${theme.palette.background.default}, ${alpha(theme.palette.background.default, 0)} 28%, ${alpha(theme.palette.background.default, 0)} 80%, ${theme.palette.background.default})`, md: `linear-gradient(to right, ${theme.palette.background.default} 2%, ${alpha(theme.palette.background.default, .98)} 28%, ${alpha(theme.palette.background.default, .88)} 40%, ${alpha(theme.palette.background.default, .3)} 56%, ${alpha(theme.palette.background.default, 0)} 70%), linear-gradient(to bottom, ${theme.palette.background.default}, ${alpha(theme.palette.background.default, 0)} 12%, ${alpha(theme.palette.background.default, 0)} 85%, ${theme.palette.background.default})` }) }} />
          </Box>
        </Box>

        <Box component="section" id="quizzes" ref={quizSection} aria-labelledby="quizzes-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' }, alignSelf: 'start', position: { md: 'sticky' }, top: { md: 32 } }}>
            <Typography component="h2" id="quizzes-title" sx={type.label}>Quizzes</Typography>
            <Steps items={notes} label="How it works" done={stepsDone} sx={{ mt: { xs: 1.5, md: 2 } }} />
          </Box>
          <Box sx={{ gridColumn: { md: '6 / span 7' }, minWidth: 0 }}>
            <SampleCases active={quizActive} onStart={onStart} onStep={completeStep} />
          </Box>
        </Box>

        <Box component="section" id="flashcards" ref={flashcardSection} aria-labelledby="flashcards-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' }, alignSelf: 'start', position: { md: 'sticky' }, top: { md: 32 } }}>
            <Typography component="h2" id="flashcards-title" sx={type.label}>Flashcards</Typography>
            <Steps items={['Read the question', 'Reveal the answer', 'See the next card']} label="How flashcards work" completed={flashcardSteps} hints={{ 2: 'Click the card or press Space to reveal the answer' }} sx={{ mt: { xs: 1.5, md: 2 } }} />
          </Box>
          <Box sx={{ gridColumn: { md: '6 / span 7' }, minWidth: 0 }}>
            <SampleFlashcards active={flashcardsActive} onStart={onStart} onStep={completeFlashcardStep} />
          </Box>
        </Box>

        <Box component="section" id="subjects" aria-labelledby="contents-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' } }}>
            <SectionHead label="Contents" title="Twelve subjects" id="contents-title">
              <Typography sx={{ ...type.body, mt: 2.5, color: 'text.secondary', maxWidth: '34ch' }}>Within each subject, quizzes and flashcard decks are grouped by topic.</Typography>
            </SectionHead>
          </Box>
          <Box component="ol" sx={{ gridColumn: { md: '6 / span 7' }, listStyle: 'none', p: 0, m: 0, columnCount: { xs: 1, sm: 2 }, columnGap: 4, borderTop: hairline }}>
            {samples.subjects.map((subject, position) => <Box component="li" key={subject.id} sx={{ breakInside: 'avoid', display: 'grid', gridTemplateColumns: '2rem 1.5rem 1fr', alignItems: 'center', columnGap: 1.5, py: 1.5, borderBottom: hairline }}>
              <Box component="span" aria-hidden sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{String(position + 1).padStart(2, '0')}</Box>
              <SubjectIcon subjectId={subject.id} sx={{ fontSize: 22, color: 'text.secondary' }} />
              <Typography sx={{ fontWeight: 600 }}>{subject.name}</Typography>
            </Box>)}
          </Box>
        </Box>

        <Box component="section" aria-labelledby="progress-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' } }}>
            <SectionHead label="Progress" title="Saved locally" id="progress-title" />
          </Box>
          <Steps sx={{ gridColumn: { md: '6 / span 6' } }} items={[
            'Your quiz scores and flashcard progress are saved on this device. They are never sent to us, and we can’t see them.',
            'No need to create an account. To study on another device, download a backup and restore it on the new device.',
            'Clearing your browser data deletes your progress.',
          ]} />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: { xs: 3, md: 4 }, textAlign: 'center', py: { xs: 6, md: 9 }, borderTop: '2px solid', borderColor: 'text.primary' }}>
          <Typography component="p" sx={{ ...type.display, fontSize: { xs: '2rem', md: '3rem' } }}>Pick a subject and begin</Typography>
          <Button ref={closingCta} variant="contained" size="large" onClick={onStart} sx={{ px: 3, py: 1.5, fontSize: '1rem' }}>Start studying</Button>
        </Box>
      </Box>
      <Box sx={{ pb: 3 }}><LegalFooter /></Box>
    </Box>

    <Box sx={{
      display: { md: 'none' }, position: 'fixed', insetInline: 0, bottom: 0, zIndex: 'appBar', px: 2, pt: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))',
      bgcolor: 'background.default', borderTop: hairline,
      visibility: showBar ? 'visible' : 'hidden', transform: showBar ? 'none' : 'translateY(100%)',
      transition: `transform 220ms ${easing.standard}, visibility 220ms`, [reducedMotion]: { transition: 'none' },
    }}>
      <Button variant="contained" size="large" fullWidth onClick={onStart}>Start studying</Button>
    </Box>
  </Box>;
}
