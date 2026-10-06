import { useEffect, useState, type ReactNode } from 'react';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import StyleRoundedIcon from '@mui/icons-material/StyleRounded';
import { Box, ButtonBase, Drawer, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AppBrand } from './AppHeader';

export type LearnerSection = 'quizzes' | 'flashcards';

export function AppNavigationDrawer({ active, currentPage, onNavigate, disabled = false }: { active: LearnerSection; currentPage?: LearnerSection; onNavigate: (section: LearnerSection) => void; disabled?: boolean }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState(desktop);
  useEffect(() => { setExpanded(desktop); }, [desktop]);
  const select = (section: LearnerSection) => {
    if (disabled) return;
    onNavigate(section);
    if (!desktop) setExpanded(false);
  };

  const item = (section: LearnerSection, label: string, icon: ReactNode, current: boolean, compact: boolean) => (
    <Tooltip key={section} title={compact ? label : ''} placement="right" enterDelay={500}>
      <ButtonBase
        disabled={disabled}
        aria-label={label}
        aria-current={currentPage === section ? 'page' : undefined}
        onClick={() => select(section)}
        sx={{ width: '100%', minHeight: 48, px: compact ? 0 : 1.5, borderRadius: 2, display: 'flex', justifyContent: compact ? 'center' : 'flex-start', gap: 1.5, color: current ? 'primary.dark' : 'text.secondary', bgcolor: current ? 'rgba(185,81,27,.1)' : 'transparent', '&:hover': { bgcolor: current ? 'rgba(185,81,27,.14)' : 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: current ? 'primary.main' : 'inherit' }}>{icon}</Box>
        {!compact && <Box component="span" sx={{ fontWeight: current ? 700 : 600, whiteSpace: 'nowrap' }}>{label}</Box>}
      </ButtonBase>
    </Tooltip>
  );

  const contents = (overlay = false) => {
    const compact = overlay ? false : (!desktop || !expanded);
    const width = overlay ? 240 : desktop && expanded ? 240 : 64;
    return <Box component="nav" aria-label="Main navigation" sx={{ width, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', p: compact ? 1 : 2, gap: 1, bgcolor: 'background.paper', borderRight: '1px solid #eee5df', overflowX: 'hidden' }}>
    <AppBrand compact={compact} onClick={() => select('quizzes')} />
    <Tooltip title={compact ? 'Expand navigation' : ''} placement="right">
      <IconButton disabled={disabled} aria-label={compact ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={overlay || (desktop && expanded)} aria-controls={`learner-navigation-items${overlay ? '-overlay' : ''}`} onClick={() => setExpanded(value => !value)} sx={{ alignSelf: compact ? 'center' : 'flex-end' }}>
        {compact ? <MenuRoundedIcon /> : <MenuOpenRoundedIcon />}
      </IconButton>
    </Tooltip>
    <Box id={`learner-navigation-items${overlay ? '-overlay' : ''}`} sx={{ display: 'flex', flexDirection: 'column', gap: .5 }}>
      {item('quizzes', 'Quizzes', <QuizRoundedIcon />, active === 'quizzes', compact)}
      {item('flashcards', 'Flashcards', <StyleRoundedIcon />, active === 'flashcards', compact)}
    </Box>
  </Box>;
  };

  const width = expanded ? 240 : 64;
  return <>
    <Box component="aside" aria-label="Meducation navigation" sx={{ width: desktop ? width : 64, flex: '0 0 auto', minHeight: '100vh', '@supports (min-height: 100dvh)': { minHeight: '100dvh' }, position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', zIndex: 1, transition: theme.transitions.create('width', { duration: theme.transitions.duration.shortest }), display: 'flex', flexDirection: 'column', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
      {contents()}
    </Box>
    {!desktop && <Drawer anchor="left" open={expanded} onClose={() => setExpanded(false)} ModalProps={{ keepMounted: true }} PaperProps={{ sx: { width: 240, bgcolor: 'background.paper' } }}>
      {contents(true)}
    </Drawer>}
  </>;
}
