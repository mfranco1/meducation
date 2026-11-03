import { lazy, Suspense } from 'react';
import { Box } from '@mui/material';

export type MarkdownVariant = 'stem' | 'explanation' | 'inline';
export type MarkdownContentKind = 'restricted' | 'rich';

// The renderer pulls in markdown, rehype and KaTeX, so it loads on first use.
const loadRenderer = () => import('./MarkdownRenderer');
const MarkdownRenderer = lazy(loadRenderer);
export const preloadMarkdownRenderer = () => {
  void loadRenderer().catch(() => undefined);
};

type MarkdownContentProps = {
  markdown: string;
  variant?: MarkdownVariant;
  contentKind?: MarkdownContentKind;
  align?: 'left' | 'center';
  fontWeight?: number;
};

export function MarkdownContent(props: MarkdownContentProps) {
  // Hidden source text reserves roughly the final layout until the renderer loads.
  const fallback = (
    <Box
      component={props.variant === 'inline' ? 'span' : 'div'}
      aria-hidden
      sx={{ visibility: 'hidden', whiteSpace: 'pre-wrap', textAlign: props.align, fontWeight: props.fontWeight }}
    >
      {props.markdown}
    </Box>
  );
  return (
    <Suspense fallback={fallback}>
      <MarkdownRenderer {...props} />
    </Suspense>
  );
}
