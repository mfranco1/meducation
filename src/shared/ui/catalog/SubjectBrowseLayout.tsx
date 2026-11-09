import { fontWeight } from '../../theme';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useId, type ReactNode, type Ref } from 'react';
import { SubjectIconBadge } from './icons/SubjectIconBadge';
import { reducedMotion } from '../motion';
import { LoadingSkeleton } from '../loading/LoadingSkeleton';

export function SubjectBrowseLayout({
  subjectId,
  subjectName,
  subjectDescription,
  progress,
  contentType,
  onContentTypeChange,
  selectedTabRef,
  onBack,
  children,
}: {
  subjectId: string;
  subjectName: string;
  subjectDescription?: string;
  progress?: { completed: number; total: number; nouns: string } | null;
  contentType: 'quizzes' | 'flashcards';
  onContentTypeChange: (type: 'quizzes' | 'flashcards') => void;
  selectedTabRef?: Ref<HTMLButtonElement>;
  onBack: () => void;
  children: ReactNode;
}) {
  const waveId = useId();
  const showProgress = useMediaQuery((theme: Theme) => theme.breakpoints.up('sm'));
  const navigationId = useId();
  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <Box sx={{ position: 'relative', isolation: 'isolate' }}>
      <Box
        component="svg"
        viewBox="0 0 1440 440"
        preserveAspectRatio="xMaxYMin slice"
        aria-hidden="true"
        focusable="false"
        sx={{
          position: 'absolute',
          zIndex: -1,
          pointerEvents: 'none',
          inset: '0 0 auto',
          width: '100%',
          height: { xs: 300, sm: 360 },
          color: 'primary.light',
          opacity: { xs: 0.65, sm: 1 },
          maskImage: 'linear-gradient(to bottom, black 15%, transparent 100%)',
        }}
      >
        <defs>
          <radialGradient id={`${waveId}-wash`} cx="95%" cy="0%" r="90%">
            <stop stopColor="currentColor" stopOpacity=".7" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${waveId}-ribbon`} x1="0" y1="1" x2=".85" y2="0">
            <stop stopColor="currentColor" stopOpacity="0" />
            <stop offset=".55" stopColor="currentColor" stopOpacity=".2" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".85" />
          </linearGradient>
          <linearGradient id={`${waveId}-edge`} x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#fffdfb" stopOpacity="0" />
            <stop offset=".65" stopColor="#fffdfb" stopOpacity=".6" />
            <stop offset="1" stopColor="#fffdfb" stopOpacity=".15" />
          </linearGradient>
        </defs>
        <path d="M0 0H1440V440H0Z" fill={`url(#${waveId}-wash)`} />
        <path
          d="M420 440 C640 400 770 240 940 115 C1100 -2 1250 -35 1440 -65 L1440 92 C1220 65 1090 113 925 237 C740 377 610 443 420 480Z"
          fill={`url(#${waveId}-ribbon)`}
        />
        <path
          d="M420 440 C640 400 770 240 940 115 C1100 -2 1250 -35 1440 -65"
          fill="none"
          stroke={`url(#${waveId}-edge)`}
          strokeWidth="1.5"
        />
        <path
          d="M665 460 C870 395 1020 238 1180 147 C1280 90 1375 70 1470 45 L1470 330 C1280 240 1180 260 1020 345 C875 425 770 465 665 490Z"
          fill={`url(#${waveId}-ribbon)`}
        />
        <path
          d="M665 460 C870 395 1020 238 1180 147 C1280 90 1375 70 1470 45"
          fill="none"
          stroke={`url(#${waveId}-edge)`}
          strokeWidth="1.5"
        />
      </Box>
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        <Box sx={{ mb: 4 }}>
          <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">
            Dashboard
          </Button>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mt: 2 }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
              <SubjectIconBadge subjectId={subjectId} size={88} iconSize={64} />
              <Stack sx={{ justifyContent: 'center', minHeight: 88, minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="h3" sx={{ overflowWrap: 'break-word', minWidth: 0 }}>
                  {subjectName}
                </Typography>
                {subjectDescription && (
                  <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                    {subjectDescription}
                  </Typography>
                )}
              </Stack>
            </Stack>
            {showProgress && (
              <Stack
                spacing={1}
                sx={{ alignItems: 'center', flex: '0 0 auto', width: 160, minHeight: 90, textAlign: 'center' }}
              >
                {progress === null ? (
                  <>
                    <LoadingSkeleton aria-hidden variant="circular" width={66} height={66} />
                    <LoadingSkeleton aria-hidden variant="text" width={120} height={16} />
                  </>
                ) : progress && progress.total > 0 ? (
                  <>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <CircularProgress
                        variant="determinate"
                        value={100}
                        size={66}
                        thickness={4}
                        sx={{ color: 'divider' }}
                        aria-hidden
                      />
                      {percent > 0 && (
                        <CircularProgress
                          variant="determinate"
                          value={percent}
                          size={66}
                          thickness={4}
                          aria-hidden
                          sx={{
                            position: 'absolute',
                            left: 0,
                            '& .MuiCircularProgress-circle': { [reducedMotion]: { transition: 'none' } },
                          }}
                        />
                      )}
                      <Typography
                        variant="subtitle2"
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: fontWeight.semibold,
                        }}
                      >
                        {percent}%
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', lineHeight: 1.2 }}
                    >{`${progress.completed} / ${progress.total} ${progress.nouns} completed`}</Typography>
                  </>
                ) : null}
              </Stack>
            )}
          </Stack>
        </Box>
        <Tabs
          value={contentType}
          onChange={(_, value: 'quizzes' | 'flashcards') => onContentTypeChange(value)}
          aria-label="Subject content"
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            component="button"
            ref={contentType === 'quizzes' ? selectedTabRef : undefined}
            id={`${navigationId}-quizzes`}
            aria-controls={`${navigationId}-panel`}
            value="quizzes"
            label="Quizzes"
          />
          <Tab
            component="button"
            ref={contentType === 'flashcards' ? selectedTabRef : undefined}
            id={`${navigationId}-flashcards`}
            aria-controls={`${navigationId}-panel`}
            value="flashcards"
            label="Flashcards"
          />
        </Tabs>
        <Box role="tabpanel" id={`${navigationId}-panel`} aria-labelledby={`${navigationId}-${contentType}`}>
          {children}
        </Box>
      </Container>
    </Box>
  );
}
