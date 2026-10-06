import { Component, type ReactNode, Suspense, useEffect } from 'react';
import { Alert, Button, Container } from '@mui/material';
import { LoadedScreenContent, ScreenLoading } from './ScreenLoading';
import { screenTransitionDurationMs } from '../transitions/ScreenTransition';

function LoadingFallback({ label, onShown }: { label: string; onShown: () => void }) {
  useEffect(() => onShown(), [onShown]);
  return <ScreenLoading label={label} />;
}

export class ScreenLoadBoundary extends Component<{ children: ReactNode; loadingLabel?: string; onLoadingChange?: (loading: boolean) => void }, { failed: boolean; loadingWasShown: boolean }> {
  state = { failed: false, loadingWasShown: false };
  private readonly mountedAt = performance.now();

  markLoadingShown = () => {
    this.props.onLoadingChange?.(true);
    if (!this.state.loadingWasShown) this.setState({ loadingWasShown: true });
  };

  markReady = () => this.props.onLoadingChange?.(false);

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error) {
    this.props.onLoadingChange?.(false);
    console.error('A screen could not load.', error);
  }

  render() {
    if (this.state.failed) return <Container maxWidth="sm" sx={{ py: 6 }}><Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload</Button>}>This screen could not load. Reload to try again.</Alert></Container>;
    return <Suspense fallback={<LoadingFallback label={this.props.loadingLabel ?? 'Loading…'} onShown={this.markLoadingShown} />}>
      <LoadedScreenContent animate={this.state.loadingWasShown && performance.now() - this.mountedAt >= screenTransitionDurationMs} onReady={this.markReady}>{this.props.children}</LoadedScreenContent>
    </Suspense>;
  }
}
