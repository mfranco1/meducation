import { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';

export function AdminParentActions({
  entity,
  disabled,
  onEdit,
  onDelete,
}: {
  entity: 'Subject' | 'Topic' | 'Quiz' | 'Deck';
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        size="small"
        color="inherit"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {entity} actions
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onEdit();
          }}
        >
          Edit {entity.toLowerCase()}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onDelete();
          }}
        >
          Delete {entity.toLowerCase()}…
        </MenuItem>
      </Menu>
    </>
  );
}
