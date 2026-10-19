import { Box, alpha, useTheme } from '@mui/material';
import { SubjectIcon } from './SubjectIcon';

export function SubjectIconBadge({ subjectId, size = 48 }: { subjectId: string; size?: number }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: alpha(theme.palette.primary.main, 0.07),
        borderRadius: '12px',
        color: 'primary.main',
        display: 'flex',
        flex: `0 0 ${size}px`,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      <SubjectIcon subjectId={subjectId} sx={{ fontSize: Math.round(size * 0.58) }} />
    </Box>
  );
}
