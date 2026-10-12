import { Box, alpha, useTheme } from '@mui/material';
import { SubjectIcon } from './SubjectIcon';

export function SubjectIconBadge({ subjectId }: { subjectId: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        alignItems: 'center',
        bgcolor: alpha(theme.palette.primary.main, 0.07),
        borderRadius: '50%',
        color: 'primary.main',
        display: 'flex',
        flex: '0 0 40px',
        height: 40,
        justifyContent: 'center',
        width: 40,
      }}
    >
      <SubjectIcon subjectId={subjectId} sx={{ fontSize: 24 }} />
    </Box>
  );
}
