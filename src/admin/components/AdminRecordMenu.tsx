import { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';

export interface RecordMenuItem {
  label: string;
  disabled?: boolean;
  hidden?: boolean;
  onClick: () => void;
}
/** The "Record actions" menu shared by the quiz and flashcard editors. */
export function AdminRecordMenu({ disabled, items }: { disabled?: boolean; items: RecordMenuItem[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        aria-haspopup="menu"
        size="small"
        disabled={disabled}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Record actions
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {items
          .filter((item) => !item.hidden)
          .map((item) => (
            <MenuItem
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setAnchor(null);
                item.onClick();
              }}
            >
              {item.label}
            </MenuItem>
          ))}
      </Menu>
    </>
  );
}
