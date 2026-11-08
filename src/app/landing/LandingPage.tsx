import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { keyframes } from '@emotion/react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  alpha,
  Box,
  Button,
  ClickAwayListener,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { AppBrand } from '../../shared/ui/brand/AppBrand';
import { SubjectIcon } from '../../shared/ui/catalog/icons/SubjectIcon';
import { faqs } from '../components/HelpDialog';
import { LegalFooter } from '../../shared/ui/shell/LegalFooter';
import { easing, reducedMotion } from '../../shared/ui/motion';
import { theme } from '../../shared/theme';
import { SampleCases } from './SampleCases';
import { SampleFlashcards } from './SampleFlashcards';
import { useSampleActive } from './useSampleActive';
import { hairline, type } from './typography';
import samples from './samples.json';

const grid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' },
  columnGap: 3,
} as const;
const section = {
  py: { xs: 8, md: 16 },
  borderTop: hairline,
  scrollMarginTop: { xs: '24px', md: '96px' },
} as const;
const split = { ...grid, rowGap: 4 } as const;
const centered = { textAlign: 'center', maxWidth: 720, mx: 'auto' } as const;

const stats = [
  ['17,000+', 'questions'],
  ['20,000+', 'flashcards'],
  ['12', 'subjects'],
];

const landingFaqs = new Set([
  'Where is my progress saved?',
  'How do I back up or move my progress?',
  'What is the difference between quiz modes?',
  'How do I report a content mistake?',
]);

const privacy = [
  { Icon: NoAccountsOutlinedIcon, title: 'No account', text: 'Start studying right away. Nothing to sign up for.' },
  {
    Icon: DevicesOutlinedIcon,
    title: 'Stays on this device',
    text: 'Your scores are saved in this browser. We never see them.',
  },
  {
    Icon: FileDownloadOutlinedIcon,
    title: 'Backup and restore',
    text: 'Download a backup to move your progress to another device.',
  },
];

const successMain = theme.palette.success.main;

const notes = ['Choose an answer', 'Read the explanation', 'Celebrate your progress'];
const sectionLinks = [
  ['Quizzes', '#quizzes'],
  ['Flashcards', '#flashcards'],
  ['Subjects', '#subjects'],
];

const stepPulse = keyframes`
  0% { transform: scale(1); box-shadow: 0 0 0 0 ${alpha(successMain, 0.4)}; }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); box-shadow: 0 0 0 10px ${alpha(successMain, 0)}; }
`;

function StepHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip title={text} describeChild open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
        <IconButton
          aria-label={label}
          size="small"
          onClick={() => setOpen(true)}
          sx={{ ml: 0.5, p: 0.25, verticalAlign: 'middle', color: 'text.secondary' }}
        >
          <HelpOutlineRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </ClickAwayListener>
  );
}

/** Numbered circles joined by a line. Completed steps show green checks with one pulse. */
function Steps({
  items,
  label,
  done = 0,
  completed,
  hints,
  sx,
}: {
  items: string[];
  label?: string;
  done?: number;
  completed?: ReadonlySet<number>;
  hints?: Partial<Record<number, string>>;
  sx?: object;
}) {
  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', p: 0, m: 0, ...sx }}>
      {items.map((item, position) => {
        const complete = completed ? completed.has(position + 1) : position < done;
        return (
          <Box
            component="li"
            key={item}
            sx={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              columnGap: 2,
              alignItems: 'start',
              '&:not(:last-of-type)': { pb: 3 },
              '&:not(:last-of-type)::after': {
                content: '""',
                position: 'absolute',
                left: 15.5,
                top: 32,
                bottom: 0,
                borderLeft: '1px solid',
                borderColor: complete ? 'success.main' : 'feedback.choiceBorder',
                transition: 'border-color 300ms ease-out',
              },
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1.5px solid',
                fontSize: '.875rem',
                fontWeight: 750,
                fontVariantNumeric: 'tabular-nums',
                borderColor: complete ? 'success.main' : 'text.primary',
                bgcolor: complete ? 'feedback.correct.surface' : 'background.paper',
                color: complete ? 'success.dark' : 'text.primary',
                transition: 'border-color 300ms ease-out, background-color 300ms ease-out, color 300ms ease-out',
                animation: complete ? `${stepPulse} 600ms ${easing.out}` : undefined,
                [reducedMotion]: { transition: 'none', animation: 'none' },
              }}
            >
              {complete ? <CheckRoundedIcon sx={{ fontSize: 20 }} /> : position + 1}
            </Box>
            <Typography sx={{ ...type.body, pt: '4px' }}>
              {item}
              {complete && (
                <Box component="span" sx={visuallyHidden}>
                  {' '}
                  (done)
                </Box>
              )}
              {hints?.[position + 1] && <StepHint text={hints[position + 1]!} label={`Hint for ${item}`} />}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
function SectionHead({ label, title, id }: { label: string; title: string; id: string }) {
  return (
    <>
      <Typography sx={{ ...type.label, mb: { xs: 1.5, md: 2 } }}>{label}</Typography>
      <Typography component="h2" id={id} sx={type.section}>
        {title}
      </Typography>
    </>
  );
}

/** Pale rounded square behind an icon. */
function IconTile({ children }: { children: ReactNode }) {
  return (
    <Box
      aria-hidden
      sx={{
        display: 'grid',
        placeItems: 'center',
        width: 48,
        height: 48,
        borderRadius: '12px',
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.07),
        color: 'primary.main',
      }}
    >
      {children}
    </Box>
  );
}

/** Fades and rises once when first scrolled into view. Shows at once without IntersectionObserver or with reduced motion. */
function Reveal({ children, delay = 0, sx }: { children: ReactNode; delay?: number; sx?: object }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (shown || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setShown(true), {
      rootMargin: '0px 0px -8% 0px',
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [shown]);
  const transition = (property: string) => `${property} 600ms ${easing.out} ${delay}ms`;
  return (
    <Box
      ref={ref}
      onFocus={() => setShown(true)}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(14px)',
        transition: `${transition('opacity')}, ${transition('transform')}`,
        [reducedMotion]: { opacity: 1, transform: 'none', transition: 'none' },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

const startButton = { px: 3.5, py: 1.75, fontSize: '1.0625rem' } as const;

export function LandingPage({ onStart }: { onStart: () => void }) {
  const heroCta = useRef<HTMLButtonElement>(null);
  const closingCta = useRef<HTMLButtonElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const quizSection = useRef<HTMLElement>(null);
  const flashcardSection = useRef<HTMLElement>(null);
  const quizActive = useSampleActive(quizSection);
  const flashcardsActive = useSampleActive(flashcardSection);
  const [stepsDone, setStepsDone] = useState(0);
  const completeStep = useCallback((step: number) => setStepsDone((current) => Math.max(current, step)), []);
  const [flashcardSteps, setFlashcardSteps] = useState<ReadonlySet<number>>(new Set());
  const completeFlashcardStep = useCallback(
    (step: number) => setFlashcardSteps((current) => (current.has(step) ? current : new Set(current).add(step))),
    [],
  );
  const [ctaInView, setCtaInView] = useState({ hero: true, closing: false });
  const [scrolled, setScrolled] = useState(false);

  // The phone layout keeps Start studying within thumb reach once the hero button scrolls away.
  useEffect(() => {
    const observer = new IntersectionObserver((entries) =>
      setCtaInView((current) => {
        const next = { ...current };
        entries.forEach((entry) => {
          next[entry.target === heroCta.current ? 'hero' : 'closing'] = entry.isIntersecting;
        });
        return next;
      }),
    );
    [heroCta.current, closingCta.current].forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const showBar = !ctaInView.hero && !ctaInView.closing;

  // The header floats as a bar once the page leaves the top.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    if (topSentinel.current) observer.observe(topSentinel.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: 'background.default',
        color: 'text.primary',
        minHeight: '100dvh',
        pb: { xs: 11, md: 0 },
      }}
    >
      <Box ref={topSentinel} aria-hidden sx={{ position: 'absolute', top: 0, height: '1px', width: '1px' }} />
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3, md: 4 } }}>
        <Box
          component="header"
          sx={(theme) => ({
            position: 'sticky',
            top: { xs: 8, md: 12 },
            zIndex: 'appBar',
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '1fr auto 1fr' },
            alignItems: 'center',
            gap: 2,
            py: { xs: 1.5, md: 2 },
            px: scrolled ? { xs: 1.5, md: 2.5 } : 0,
            border: '1px solid',
            borderRadius: '14px',
            borderColor: scrolled ? 'feedback.choiceBorder' : 'transparent',
            bgcolor: scrolled ? alpha(theme.palette.background.paper, 0.72) : 'transparent',
            backdropFilter: scrolled ? 'saturate(180%) blur(20px)' : 'none',
            boxShadow: `0 8px 24px ${alpha(theme.palette.text.primary, scrolled ? 0.06 : 0)}`,
            transition: `background-color 220ms ${easing.standard}, border-color 220ms ${easing.standard}, box-shadow 220ms ${easing.standard}, padding 220ms ${easing.standard}`,
            [reducedMotion]: { transition: 'none' },
          })}
        >
          <AppBrand size={{ xs: 132, md: 156 }} />
          <Box component="nav" aria-label="Sections" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
            {sectionLinks.map(([label, href]) => (
              <Button key={href} href={href} sx={{ color: 'text.primary', fontWeight: 600 }}>
                {label}
              </Button>
            ))}
          </Box>
          <Button
            variant="contained"
            disableElevation
            onClick={onStart}
            sx={{ display: { xs: 'none', md: 'inline-flex' }, justifySelf: 'end' }}
          >
            Start studying
          </Button>
        </Box>

        <Box component="main">
          <Box
            component="section"
            aria-labelledby="hero-title"
            sx={{
              ...grid,
              alignItems: 'center',
              rowGap: 6,
              pt: { xs: 4, md: 8 },
              pb: { xs: 8, md: 12 },
            }}
          >
            <Box sx={{ gridColumn: { md: '1 / span 6' }, textAlign: { xs: 'center', md: 'left' } }}>
              <Typography sx={{ ...type.label, color: 'primary.main', mb: { xs: 2, md: 3 } }}>
                Review · Practice · Improve
              </Typography>
              <Typography
                component="h1"
                id="hero-title"
                sx={{ ...type.display, maxWidth: '18ch', mx: { xs: 'auto', md: 0 } }}
              >
                Study medicine one question at a time
              </Typography>
              <Typography sx={{ ...type.lede, mt: { xs: 2, md: 3 }, mx: { xs: 'auto', md: 0 } }}>
                Study quizzes and flashcards across twelve subjects for free
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: { xs: 'center', md: 'flex-start' },
                  gap: 1.5,
                  mt: { xs: 3, md: 4 },
                }}
              >
                <Button
                  ref={heroCta}
                  variant="contained"
                  size="large"
                  disableElevation
                  onClick={onStart}
                  sx={startButton}
                >
                  Start studying
                </Button>
                <Button href="#quizzes" size="large" sx={{ ...startButton, px: 2.5 }}>
                  Try a question
                </Button>
              </Box>
              <Typography
                sx={{
                  ...type.caption,
                  fontSize: '.9375rem',
                  mt: { xs: 3, md: 4 },
                  '& b': { fontWeight: 700, color: 'text.primary' },
                }}
              >
                {stats.map(([number, words], position) => (
                  <Fragment key={words}>
                    {position > 0 && ' · '}
                    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                      <b>{number}</b> {words}
                    </Box>
                  </Fragment>
                ))}
              </Typography>
            </Box>
            <Box
              sx={{
                gridColumn: { md: '7 / span 6' },
                aspectRatio: '1448 / 1086',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              <Box
                component="img"
                src="/assets/illustrations/landing-hero-960.webp"
                srcSet="/assets/illustrations/landing-hero-640.webp 640w, /assets/illustrations/landing-hero-960.webp 960w, /assets/illustrations/landing-hero-1440.webp 1440w"
                sizes="(min-width: 1200px) 560px, (min-width: 900px) 50vw, 100vw"
                width={1448}
                height={1086}
                alt=""
                loading="eager"
                fetchPriority="high"
                decoding="async"
                sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>
          </Box>

          <Box
            component="section"
            id="quizzes"
            ref={quizSection}
            aria-labelledby="quizzes-title"
            sx={{ ...section, ...split }}
          >
            <Reveal
              sx={{
                gridColumn: { md: '1 / span 4' },
                alignSelf: 'start',
                position: { md: 'sticky' },
                top: { md: 120 },
              }}
            >
              <SectionHead label="Quizzes" title="Board-style Questions" id="quizzes-title" />
              <Typography sx={{ ...type.body, mt: 2.5, color: 'text.secondary' }}>
                Answer clinical vignettes, then read why each choice is right or wrong.
              </Typography>
              <Steps items={notes} label="How it works" done={stepsDone} sx={{ mt: 4 }} />
            </Reveal>
            <Reveal delay={100} sx={{ gridColumn: { md: '6 / span 7' }, minWidth: 0 }}>
              <SampleCases active={quizActive} onStart={onStart} onStep={completeStep} />
            </Reveal>
          </Box>

          <Box
            component="section"
            id="flashcards"
            ref={flashcardSection}
            aria-labelledby="flashcards-title"
            sx={{ ...section, ...split }}
          >
            <Reveal
              sx={{
                gridColumn: { md: '1 / span 4' },
                alignSelf: 'start',
                position: { md: 'sticky' },
                top: { md: 120 },
              }}
            >
              <SectionHead label="Flashcards" title="High-yield Flashcards" id="flashcards-title" />
              <Typography sx={{ ...type.body, mt: 2.5, color: 'text.secondary' }}>
                Recall the answer, then reveal it and move to the next card.
              </Typography>
              <Steps
                items={['Read the question', 'Reveal the answer', 'See the next card']}
                label="How flashcards work"
                completed={flashcardSteps}
                hints={{ 2: 'Click the card or press Space to reveal the answer' }}
                sx={{ mt: 4 }}
              />
            </Reveal>
            <Reveal delay={100} sx={{ gridColumn: { md: '6 / span 7' }, minWidth: 0 }}>
              <SampleFlashcards active={flashcardsActive} onStart={onStart} onStep={completeFlashcardStep} />
            </Reveal>
          </Box>

          <Box component="section" id="subjects" aria-labelledby="contents-title" sx={section}>
            <Reveal sx={centered}>
              <SectionHead label="Contents" title="Twelve subjects" id="contents-title" />
              <Typography sx={{ ...type.body, mt: 2.5, mx: 'auto', color: 'text.secondary' }}>
                Within each subject, quizzes and flashcard decks are grouped by topic.
              </Typography>
            </Reveal>
            <Reveal delay={100} sx={{ mt: { xs: 5, md: 8 } }}>
              <Box
                component="ol"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: 'repeat(3, minmax(0, 1fr))',
                    md: 'repeat(4, minmax(0, 1fr))',
                  },
                  gap: '1px',
                  bgcolor: 'feedback.choiceBorder',
                  overflow: 'hidden',
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                }}
              >
                {samples.subjects.map((subject) => (
                  <Box
                    component="li"
                    key={subject.id}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 3,
                      textAlign: 'center',
                      bgcolor: 'background.default',
                    }}
                  >
                    <IconTile>
                      <SubjectIcon subjectId={subject.id} sx={{ fontSize: 28 }} />
                    </IconTile>
                    <Typography sx={{ fontWeight: 600 }}>{subject.name}</Typography>
                  </Box>
                ))}
              </Box>
            </Reveal>
          </Box>

          <Box component="section" aria-labelledby="progress-title" sx={section}>
            <Reveal sx={centered}>
              <SectionHead label="Progress" title="Your progress stays with you" id="progress-title" />
            </Reveal>
            <Reveal delay={100} sx={{ mt: { xs: 5, md: 8 } }}>
              <Box
                component="ul"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                }}
              >
                {privacy.map(({ Icon, title, text }) => (
                  <Box
                    component="li"
                    key={title}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 4,
                      py: { xs: 4, md: 2 },
                      textAlign: 'center',
                      '&:not(:first-of-type)': {
                        borderColor: 'feedback.choiceBorder',
                        borderStyle: 'solid',
                        borderWidth: { xs: '1px 0 0', md: '0 0 0 1px' },
                      },
                    }}
                  >
                    <IconTile>
                      <Icon sx={{ fontSize: 24 }} />
                    </IconTile>
                    <Typography component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, m: 0 }}>
                      {title}
                    </Typography>
                    <Typography sx={{ ...type.body, color: 'text.secondary' }}>{text}</Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ ...type.caption, mt: 4, textAlign: 'center' }}>
                Clearing your browser data deletes your progress.
              </Typography>
            </Reveal>
          </Box>

          <Box component="section" aria-labelledby="faq-title" sx={section}>
            <Reveal>
              <Typography component="h2" id="faq-title" sx={{ ...type.section, textAlign: 'center' }}>
                Frequently asked questions
              </Typography>
            </Reveal>
            <Reveal delay={100} sx={{ maxWidth: 800, mx: 'auto', mt: { xs: 5, md: 8 } }}>
              {faqs
                .filter(([question]) => landingFaqs.has(question))
                .map(([question, answer], index) => (
                  <Accordion
                    key={question}
                    disableGutters
                    elevation={0}
                    square
                    sx={{
                      bgcolor: 'transparent',
                      color: 'inherit',
                      borderBottom: hairline,
                      '&:first-of-type': { borderTop: hairline },
                      '&::before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreRoundedIcon />}
                      id={`landing-faq-${index}`}
                      aria-controls={`landing-answer-${index}`}
                      sx={{ px: 0, py: 1 }}
                    >
                      <Typography sx={{ fontSize: '1.0625rem', fontWeight: 600 }}>{question}</Typography>
                    </AccordionSummary>
                    <AccordionDetails id={`landing-answer-${index}`} sx={{ px: 0, pt: 0, pb: 3 }}>
                      <Typography sx={{ ...type.body, color: 'text.secondary' }}>{answer}</Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
            </Reveal>
          </Box>

          <Reveal
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: { xs: 3, md: 4 },
              textAlign: 'center',
              py: { xs: 8, md: 12 },
              borderTop: hairline,
            }}
          >
            <Typography component="p" sx={{ ...type.display, fontSize: { xs: '2rem', md: '3rem' } }}>
              Pick a subject and begin
            </Typography>
            <Button
              ref={closingCta}
              variant="contained"
              size="large"
              disableElevation
              onClick={onStart}
              sx={{ px: 3, py: 1.5, fontSize: '1rem' }}
            >
              Start studying
            </Button>
          </Reveal>
        </Box>
        <Box sx={{ pb: 3 }}>
          <LegalFooter />
        </Box>
      </Box>

      <Box
        sx={{
          display: { md: 'none' },
          position: 'fixed',
          insetInline: 0,
          bottom: 0,
          zIndex: 'appBar',
          px: 2,
          pt: 1.5,
          pb: 'calc(12px + env(safe-area-inset-bottom))',
          bgcolor: 'background.default',
          borderTop: hairline,
          visibility: showBar ? 'visible' : 'hidden',
          transform: showBar ? 'none' : 'translateY(100%)',
          transition: `transform 220ms ${easing.standard}, visibility 220ms`,
          [reducedMotion]: { transition: 'none' },
        }}
      >
        <Button variant="contained" size="large" fullWidth disableElevation onClick={onStart}>
          Start studying
        </Button>
      </Box>
    </Box>
  );
}
