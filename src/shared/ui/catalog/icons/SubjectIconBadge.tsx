import { Box, alpha, useTheme } from '@mui/material';
import { SubjectIcon } from './SubjectIcon';

export function SubjectIconBadge({ subjectId }: { subjectId: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: alpha(theme.palette.primary.main, 0.07),
        borderRadius: '12px',
        color: 'primary.main',
        display: 'flex',
        flex: '0 0 48px',
        height: 48,
        justifyContent: 'center',
        width: 48,
      }}
    >
      <SubjectIcon subjectId={subjectId} sx={{ fontSize: '1.75rem' }} />
    </Box>
  );
}
