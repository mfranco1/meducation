import { useState, type ReactNode } from 'react';
import { Box, Button, Container, Divider, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import { AppBrand } from '../../shared/ui/brand/AppBrand';

interface Props {
  status: string;
  publishBlocked: string;
  busy: boolean;
  accountBusy?: boolean;
  undoAvailable: boolean;
  publicationAvailable: boolean;
  onStatus: () => void;
  onPublish: () => void;
  onExport: () => void;
  onVersions: () => void;
  onUndo: () => void;
  onReset: () => void;
  onRefresh: () => void;
  onLogin: () => void;
  onLogout: () => void;
  sessionDetails: ReactNode;
}
export function AdminHeader(props: Props) {
  const [more, setMore] = useState<HTMLElement | null>(null);
  const [account, setAccount] = useState<HTMLElement | null>(null);
  const item = (label: string, action: () => void, disabled = false) => (
    <MenuItem
      disabled={props.busy || disabled}
      onClick={() => {
        setMore(null);
        action();
      }}
    >
      {label}
    </MenuItem>
  );
  return (
    <Box component="header" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Container maxWidth={false} sx={{ py: 1 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr auto', md: 'auto 1fr auto' },
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
            <AppBrand />
            <Typography variant="body2" color="text.secondary">
              Content admin
            </Typography>
          </Stack>
          <Stack
            direction="row"
            alignItems="center"
            sx={{
              gridRow: { xs: 2, md: 1 },
              gridColumn: { xs: '1 / -1', md: 2 },
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto auto',
              justifySelf: { md: 'end' },
              gap: 0.5,
              '& .MuiButton-root': { px: { xs: 1, md: 2 }, minWidth: 0, fontSize: { xs: '0.8125rem', md: '0.875rem' } },
            }}
          >
            <Button color="inherit" onClick={props.onStatus} aria-label={`Workspace status: ${props.status}`}>
              <span aria-live="polite">{props.status}</span>
            </Button>
            <Button
              variant="contained"
              disabled={props.busy || Boolean(props.publishBlocked)}
              aria-describedby={props.publishBlocked ? 'publish-blocked' : undefined}
              onClick={props.onPublish}
            >
              Review &amp; publish
            </Button>
            <Button
              color="inherit"
              aria-haspopup="menu"
              aria-expanded={Boolean(more)}
              aria-controls={more ? 'admin-more-menu' : undefined}
              onClick={(e) => setMore(e.currentTarget)}
            >
              More
            </Button>
          </Stack>
          <IconButton
            aria-label="Account"
            aria-haspopup="menu"
            aria-expanded={Boolean(account)}
            aria-controls={account ? 'admin-account-menu' : undefined}
            onClick={(e) => setAccount(e.currentTarget)}
            sx={{ gridRow: 1, gridColumn: { xs: 2, md: 3 } }}
          >
            <AccountCircleOutlined />
          </IconButton>
        </Box>
        {props.publishBlocked && (
          <Typography
            id="publish-blocked"
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: { md: 'right' } }}
          >
            {props.publishBlocked}
          </Typography>
        )}
      </Container>
      <Menu id="admin-more-menu" anchorEl={more} open={Boolean(more)} onClose={() => setMore(null)}>
        {item('Export content…', props.onExport)}
        {item('Published versions…', props.onVersions)}
        {item('Refresh content', props.onRefresh)}
        <Divider />
        {item('Undo last saved change…', props.onUndo, !props.undoAvailable)}
        {item('Reset draft to published version…', props.onReset, !props.publicationAvailable)}
      </Menu>
      <Menu id="admin-account-menu" anchorEl={account} open={Boolean(account)} onClose={() => setAccount(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 300 }}>{props.sessionDetails}</Box>
        <MenuItem
          disabled={props.accountBusy ?? props.busy}
          onClick={() => {
            setAccount(null);
            props.onLogin();
          }}
        >
          Refresh authentication
        </MenuItem>
        <MenuItem
          disabled={props.accountBusy ?? props.busy}
          onClick={() => {
            setAccount(null);
            props.onLogout();
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </Box>
  );
}
