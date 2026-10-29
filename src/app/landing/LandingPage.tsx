import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import katexMainRegular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?url';
import { AppBrand } from '../../shared/ui/brand/AppBrand';
import { SubjectIcon } from '../../shared/ui/catalog/icons/SubjectIcon';
import { LegalFooter } from '../../shared/ui/catalog/LegalFooter';
import { easing, reducedMotion } from '../../shared/ui/motion';
import { SampleCases } from './SampleCases';
import { SampleFlashcards } from './SampleFlashcards';
import { hairline, serif, type } from './typography';
import samples from './samples.json';

// The display face is needed for the first paint of the headline. KaTeX's stylesheet declares the face.
const preload = Object.assign(document.createElement('link'), { rel: 'preload', as: 'font', type: 'font/woff2', href: katexMainRegular, crossOrigin: 'anonymous' });
document.head.append(preload);

const grid = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' }, columnGap: 3 } as const;
const section = { ...grid, py: { xs: 6, md: 10 }, borderTop: hairline } as const;

const notes = [
  'Choose an answer. Feedback appears at once.',
  'Each question has a rationale and a high-yield pearl.',
  'Answer three in a row correctly to start a streak.',
];

function Notes({ sx }: { sx: object }) {
  return <Box component="ol" aria-label="Notes" sx={{ listStyle: 'none', p: 0, m: 0, borderTop: hairline, ...sx }}>
    {notes.map((note, position) => <Box component="li" key={note} sx={{ display: 'grid', gridTemplateColumns: '1.25rem 1fr', pt: 1.5 }}>
      <Box component="span" aria-hidden sx={{ fontFamily: serif, fontSize: '.9375rem', lineHeight: 1.5, color: 'text.primary' }}>{position + 1}</Box>
      <Typography sx={type.note}>{note}</Typography>
    </Box>)}
  </Box>;
}

function SectionHead({ folio, label, title, id, children }: { folio: string; label: string; title: string; id: string; children?: ReactNode }) {
  return <Box>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: { xs: 2, md: 3 } }}>
      <Box component="span" aria-hidden sx={type.folio}>{folio}</Box>
      <Typography sx={type.label}>{label}</Typography>
    </Box>
    <Typography component="h2" id={id} sx={type.section}>{title}</Typography>
    {children}
  </Box>;
}

export function LandingPage({ onStart }: { onStart: () => void }) {
  const heroCta = useRef<HTMLButtonElement>(null);
  const closingCta = useRef<HTMLButtonElement>(null);
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
        <Typography sx={{ ...type.label, display: { xs: 'none', md: 'block' } }}>Quizzes and flashcards for medicine</Typography>
        <Button variant="contained" onClick={onStart} sx={{ flexShrink: 0 }}>Start studying</Button>
      </Box>

      <Box component="main">
        <Box sx={{ ...grid, rowGap: { xs: 5, md: 0 }, pt: { xs: 3, md: 8 }, pb: { xs: 6, md: 10 } }}>
          <Box sx={{ gridColumn: { md: '1 / span 5' }, alignSelf: 'start', position: { md: 'sticky' }, top: { md: 32 } }}>
            <Typography component="h1" sx={type.display}>Study medicine <Box component="em" sx={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>one good question</Box> <Box component="span" sx={{ whiteSpace: 'nowrap' }}>at a time.</Box></Typography>
            <Typography sx={{ ...type.lede, mt: { xs: 2, md: 3.5 } }}>
              Practice questions and flashcards across twelve subjects, free. Answer a question, read the rationale, and keep going.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1.5, mt: { xs: 3, md: 4 } }}>
              <Button ref={heroCta} variant="contained" size="large" onClick={onStart} sx={{ px: 3, py: 1.5, fontSize: '1rem' }}>Start studying</Button>
              <Typography sx={type.caption}>No account. Your progress stays in this browser.</Typography>
            </Box>
            <Notes sx={{ display: { xs: 'none', md: 'block' }, mt: 6, maxWidth: '34ch' }} />
          </Box>
          <Box sx={{ gridColumn: { md: '7 / span 6' }, minWidth: 0 }}>
            <SampleCases onStart={onStart} />
            <Typography sx={{ ...type.note, display: { md: 'none' }, mt: 2 }}>Choose an answer to see the rationale. Three correct in a row starts a streak.</Typography>
          </Box>
        </Box>

        <Box component="section" aria-labelledby="flashcards-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '9 / span 4' }, gridRow: { md: 1 }, alignSelf: 'start' }}>
            <SectionHead folio="§ 1" label="Flashcards" title="Recall first, then check." id="flashcards-title">
              <Typography sx={{ ...type.body, mt: 2.5 }}>Read the prompt and answer it in your head. Then reveal the card: click it, or press Space.</Typography>
              <Typography sx={{ ...type.body, mt: 1.5, color: 'text.secondary' }}>In the app, decks save your place, and a gold glow builds around the card as you work through one in a sitting.</Typography>
            </SectionHead>
          </Box>
          <Box sx={{ gridColumn: { md: '1 / span 7' }, gridRow: { md: 1 }, minWidth: 0 }}>
            <SampleFlashcards onStart={onStart} />
          </Box>
        </Box>

        <Box component="section" aria-labelledby="contents-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' } }}>
            <SectionHead folio="§ 2" label="Contents" title="Twelve subjects" id="contents-title">
              <Typography sx={{ ...type.body, mt: 2.5, color: 'text.secondary', maxWidth: '34ch' }}>Within each subject, quizzes and flashcard decks are grouped by topic.</Typography>
            </SectionHead>
          </Box>
          <Box component="ol" sx={{ gridColumn: { md: '6 / span 7' }, listStyle: 'none', p: 0, m: 0, columnCount: { xs: 1, sm: 2 }, columnGap: 4, borderTop: hairline }}>
            {samples.subjects.map((subject, position) => <Box component="li" key={subject.id} sx={{ breakInside: 'avoid', display: 'grid', gridTemplateColumns: '2rem 1.5rem 1fr', alignItems: 'center', columnGap: 1.5, py: 1.5, borderBottom: hairline }}>
              <Box component="span" aria-hidden sx={{ fontFamily: serif, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{String(position + 1).padStart(2, '0')}</Box>
              <SubjectIcon subjectId={subject.id} sx={{ fontSize: 22, color: 'text.secondary' }} />
              <Typography sx={{ fontWeight: 600 }}>{subject.name}</Typography>
            </Box>)}
          </Box>
        </Box>

        <Box component="section" aria-labelledby="progress-title" sx={{ ...section, rowGap: 4 }}>
          <Box sx={{ gridColumn: { md: '1 / span 4' } }}>
            <SectionHead folio="§ 3" label="Your progress" title="Kept in this browser" id="progress-title" />
          </Box>
          <Box component="ol" sx={{ gridColumn: { md: '6 / span 6' }, listStyle: 'none', p: 0, m: 0 }}>
            {[
              'Your quiz scores and flashcard places are saved on this device. They are never sent to us, and we can’t see them.',
              'There is no account. To study on another device, download a backup from Progress and restore it there.',
              'Clearing your browser data deletes your progress.',
            ].map((item, position) => <Box component="li" key={item} sx={{ display: 'grid', gridTemplateColumns: '2rem 1fr', '& + &': { mt: 2 } }}>
              <Box component="span" aria-hidden sx={{ fontFamily: serif, fontSize: '1.125rem', lineHeight: 1.5 }}>{position + 1}.</Box>
              <Typography sx={type.body}>{item}</Typography>
            </Box>)}
          </Box>
        </Box>

        <Box sx={{ ...grid, rowGap: 3, alignItems: 'end', py: { xs: 6, md: 9 }, borderTop: '2px solid', borderColor: 'text.primary' }}>
          <Typography component="p" sx={{ ...type.display, fontSize: { xs: '2rem', md: '3rem' }, maxWidth: '16ch', gridColumn: { md: '1 / span 8' } }}>Pick a subject and begin.</Typography>
          <Box sx={{ gridColumn: { md: '9 / span 4' }, justifySelf: { md: 'end' } }}>
            <Button ref={closingCta} variant="contained" size="large" onClick={onStart} sx={{ px: 3, py: 1.5, fontSize: '1rem' }}>Start studying</Button>
          </Box>
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
