import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { Subject } from '../../../domain/types';
import { SubjectIconBadge } from './icons/SubjectIconBadge';
import { reducedMotion } from '../motion';

type SubjectCardProps = {
  subject: Subject;
  onSelect: (subject: Subject) => void;
  children?: ReactNode;
  appearance?: 'standard' | 'dashboardGrid';
};

export function SubjectCard({ subject, onSelect, children, appearance = 'standard' }: SubjectCardProps) {
  const isDashboardGrid = appearance === 'dashboardGrid';
  return (
    <Card
      sx={{
        height: '100%',
        minWidth: 0,
        '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' },
        '&:has(.Mui-focusVisible)': { borderColor: subject.accent },
        transition: 'all .18s',
        [reducedMotion]: { transition: 'none', '&:hover': { transform: 'none' } },
      }}
    >
      <CardActionArea
        aria-label={`Open ${subject.name}`}
        onClick={() => onSelect(subject)}
        sx={{
          alignItems: 'flex-start',
          display: 'flex',
          height: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          minWidth: 0,
          width: '100%',
          ...(isDashboardGrid
            ? { '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } }
            : {}),
        }}
      >
        <CardContent
          sx={{
            alignSelf: 'stretch',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            width: '100%',
            minWidth: 0,
            ...(isDashboardGrid
              ? {
                  minHeight: 172,
                  height: '100%',
                  p: 2.5,
                  '&:last-child': { pb: 2.5 },
                  backgroundColor: 'background.paper',
                }
              : {}),
          }}
        >
          {isDashboardGrid ? (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 1.25, minWidth: 0 }}>
              <SubjectIconBadge subjectId={subject.id} size={80} />
              <Box sx={{ display: 'flex', flex: '1 1 auto', flexDirection: 'column', justifyContent: 'center', minHeight: 80, minWidth: 0 }}>
                <Typography
                  component="h3"
                  sx={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    lineHeight: 1.35,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    pt: 0,
                  }}
                >
                  {subject.name}
                </Typography>
                {subject.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ display: '-webkit-box', mt: 0.25, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3 }}
                  >
                    {subject.description}
                  </Typography>
                )}
              </Box>
            </Box>
          ) : (
            <Typography variant="h6">{subject.name}</Typography>
          )}
          {children &&
            (isDashboardGrid ? <Box sx={{ mt: 'auto', pt: 2, minWidth: 0, width: '100%' }}>{children}</Box> : children)}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
