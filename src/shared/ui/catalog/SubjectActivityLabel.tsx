import { Typography } from '@mui/material';

export function SubjectActivityLabel({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Typography
      component="span"
      variant="caption"
      sx={{ color: 'primary.dark', display: 'block', fontWeight: 700, mt: 1 }}
    >
      {count} in progress
    </Typography>
  );
}
