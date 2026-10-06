import { useEffect, useState, type ReactNode } from 'react';
import QuizRoundedIcon from '@mui/icons-material/QuizRounded';
import StyleRoundedIcon from '@mui/icons-material/StyleRounded';
import { Box, ButtonBase, Drawer, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AppBrand } from '../../shared/ui/shell/AppHeader';
import { DrawerEdgeToggle } from './drawer/DrawerEdgeToggle';
import { DrawerSurface } from './drawer/DrawerSurface';
import {
  learnerDrawerCollapsedWidth,
  learnerDrawerEdgeToggleOffset,
  learnerDrawerExpandedWidth,
} from './drawer/drawerDimensions';

export type LearnerSection = 'quizzes' | 'flashcards';

export function AppNavigationDrawer({
  active,
  currentPage,
  onNavigate,
  disabled = false,
}: {
  active: LearnerSection;
  currentPage?: LearnerSection;
  onNavigate: (section: LearnerSection) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState(desktop);
  useEffect(() => {
    setExpanded(desktop);
  }, [desktop]);

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
        sx={{
          width: '100%',
          minHeight: 48,
          px: compact ? 0 : 1.5,
          borderRadius: '10px',
          display: 'flex',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: 1.5,
          color: current ? 'primary.dark' : 'text.secondary',
          bgcolor: current ? 'rgba(185,81,27,.1)' : 'transparent',
          '&:hover, &:active': { bgcolor: current ? 'rgba(185,81,27,.1)' : 'transparent' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: current ? 'primary.main' : 'inherit' }}>
          {icon}
        </Box>
        {!compact && (
          <Box component="span" sx={{ fontWeight: current ? 700 : 600, whiteSpace: 'nowrap' }}>
            {label}
          </Box>
        )}
      </ButtonBase>
    </Tooltip>
  );

  const contents = (overlay = false) => {
    const compact = overlay ? false : !desktop || !expanded;
    const width = overlay
      ? learnerDrawerExpandedWidth
      : desktop && expanded
        ? learnerDrawerExpandedWidth
        : learnerDrawerCollapsedWidth;
    const contentId = `learner-navigation-items${overlay ? '-overlay' : ''}`;
    return (
      <DrawerSurface
        separator={
          <Box
            data-testid="drawer-brand-separator"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: `${learnerDrawerEdgeToggleOffset}px`,
              left: compact ? 8 : 16,
              right: 20,
              height: '1px',
              transform: 'translateY(-50%)',
              bgcolor: '#eee5df',
              opacity: 0.8,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        }
        edgeToggle={
          <DrawerEdgeToggle
            expanded={overlay || (desktop && expanded)}
            onToggle={() => setExpanded((value) => !value)}
            disabled={disabled}
            controlsId={contentId}
          />
        }
      >
        <Box
          component="nav"
          id={contentId}
          aria-label="Main navigation"
          sx={{
            width,
            height: '100%',
            minHeight: 0,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            px: compact ? 1 : 2,
            py: 2,
            gap: 1,
            bgcolor: 'background.paper',
            borderRight: '1px solid #eee5df',
          }}
        >
          <AppBrand compact={compact} onClick={() => select('quizzes')} />
          <Box aria-hidden="true" sx={{ height: 48, flex: '0 0 48px' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {item('quizzes', 'Quizzes', <QuizRoundedIcon />, active === 'quizzes', compact)}
            {item('flashcards', 'Flashcards', <StyleRoundedIcon />, active === 'flashcards', compact)}
          </Box>
        </Box>
      </DrawerSurface>
    );
  };

  const width = expanded ? learnerDrawerExpandedWidth : learnerDrawerCollapsedWidth;
  return (
    <>
      <Box
        component="aside"
        aria-label="Meducation navigation"
        sx={{
          width: desktop ? width : learnerDrawerCollapsedWidth,
          flex: '0 0 auto',
          minHeight: '100vh',
          '@supports (min-height: 100dvh)': { minHeight: '100dvh' },
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: '100vh',
          zIndex: 1,
          transition: theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        {contents()}
      </Box>
      {!desktop && (
        <Drawer
          anchor="left"
          open={expanded}
          onClose={() => setExpanded(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: learnerDrawerExpandedWidth, bgcolor: 'background.paper', overflow: 'visible' } }}
        >
          {contents(true)}
        </Drawer>
      )}
    </>
  );
}
