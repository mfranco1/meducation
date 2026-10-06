import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import { Box, ButtonBase, Typography } from '@mui/material';
import type { Ref } from 'react';

export function StudyNavigatorTile({ number, label, current, highlighted, flagged, status, wrong, onClick, tileRef }: {
  number: number; label: string; current: boolean; highlighted: boolean; flagged: boolean; status?: string; wrong?: boolean; onClick: () => void; tileRef?: Ref<HTMLButtonElement>;
}) {
  return <ButtonBase ref={tileRef} onClick={onClick} aria-label={`${label} ${number}${status ? `, ${status}` : ''}${current ? `, current ${label.toLowerCase()}` : ''}`} aria-current={current ? 'step' : undefined} sx={{
    aspectRatio: '1 / 1', width: '100%', borderRadius: 1, position: 'relative', border: '1px solid', borderColor: current ? 'primary.main' : highlighted ? '#e6b18d' : '#d9dfe7', bgcolor: highlighted ? 'primary.light' : '#fffdfb', color: highlighted ? '#853812' : '#4e5e73', fontWeight: 750, boxShadow: current ? '0 0 0 3px rgba(185, 81, 27, .18)' : 'none',
    '&:hover': { bgcolor: highlighted ? '#efc7ac' : '#f7dfcf' }, '&:focus-visible': { outline: '3px solid #b9511b', outlineOffset: 2 },
  }}>{number}{flagged && <FlagRoundedIcon aria-hidden sx={{ position: 'absolute', top: 3, right: 3, fontSize: 13, color: 'error.main' }} />}{wrong && <ErrorRoundedIcon aria-hidden sx={{ position: 'absolute', right: 3, bottom: 3, fontSize: 14, color: 'error.main' }} />}</ButtonBase>;
}

export function StudyNavigatorEmpty({ children }: { children: string }) {
  return <Box sx={{ py: 5, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}><Typography variant="body2" color="text.secondary">{children}</Typography></Box>;
}
