import { Component, type ReactNode, Suspense } from 'react';
import { Alert, Button, Container, Typography } from '@mui/material';

export class ScreenLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error) { console.error('A screen could not load.', error); }

  render() {
    if (this.state.failed) return <Container maxWidth="sm" sx={{ py: 6 }}><Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload</Button>}>This screen could not load. Reload to try again.</Alert></Container>;
    return <Suspense fallback={<Container maxWidth="sm" sx={{ py: 6 }}><Typography role="status">Loading screen…</Typography></Container>}>{this.props.children}</Suspense>;
  }
}
