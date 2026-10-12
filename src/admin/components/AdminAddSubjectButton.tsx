import { Button } from '@mui/material';

export function AdminAddSubjectButton({ onClick }: { onClick: () => void }) {
  return <Button size="small" onClick={onClick}>Add subject</Button>;
}
