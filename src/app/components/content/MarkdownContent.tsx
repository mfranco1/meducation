import { Box, Link, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type MarkdownVariant = 'stem' | 'explanation' | 'inline';

const externalUrl = /^(?:https?:|mailto:)/i;

export function MarkdownContent({ markdown, variant = 'explanation' }: { markdown: string; variant?: MarkdownVariant }) {
  const inline = variant === 'inline';
  return <ReactMarkdown
    skipHtml
    remarkPlugins={[remarkGfm]}
    urlTransform={url => externalUrl.test(url) ? url : ''}
    components={{
      p: ({ children }) => inline
        ? <>{children}</>
        : <Typography variant={variant === 'stem' ? 'h5' : 'body1'} sx={{ lineHeight: variant === 'stem' ? 1.45 : 1.75, fontSize: variant === 'explanation' ? { xs: '1rem', sm: '1.0625rem' } : undefined, '& + &': { mt: 1.25 } }}>{children}</Typography>,
      h1: ({ children }) => <Typography variant={variant === 'stem' ? 'h5' : 'h6'} component="h2" sx={{ mt: 2, mb: 1, fontWeight: 800 }}>{children}</Typography>,
      h2: ({ children }) => <Typography variant="h6" component="h3" sx={{ mt: 2, mb: 1, fontWeight: 800 }}>{children}</Typography>,
      h3: ({ children }) => <Typography variant="subtitle1" component="h4" sx={{ mt: 1.75, mb: .75, fontWeight: 800 }}>{children}</Typography>,
      ul: ({ children }) => <Box component="ul" sx={{ my: 1.25, pl: 3, '& li + li': { mt: .65 } }}>{children}</Box>,
      ol: ({ children }) => <Box component="ol" sx={{ my: 1.25, pl: 3, '& li + li': { mt: .65 } }}>{children}</Box>,
      li: ({ children }) => <Typography component="li" sx={{ lineHeight: 1.7 }}>{children}</Typography>,
      blockquote: ({ children }) => <Box component="blockquote" sx={{ m: 0, my: 1.5, pl: 2, borderLeft: '3px solid', borderColor: 'primary.light', color: 'text.secondary' }}>{children}</Box>,
      table: ({ children }) => <Box sx={{ my: 2, overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Box component="table" sx={{ width: '100%', minWidth: 440, borderCollapse: 'collapse', '& th, & td': { p: 1.25, textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid', borderColor: 'divider' }, '& th': { bgcolor: 'action.hover', fontWeight: 800 }, '& tr:last-child td': { borderBottom: 0 } }}>{children}</Box></Box>,
      a: ({ href, children }) => href ? <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover">{children}</Link> : <>{children}</>,
      code: ({ children }) => <Box component="code" sx={{ px: .5, py: .15, borderRadius: .5, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '.9em' }}>{children}</Box>,
      pre: ({ children }) => <Box component="pre" sx={{ my: 1.5, p: 1.5, overflowX: 'auto', borderRadius: 1, bgcolor: 'action.hover' }}>{children}</Box>,
      hr: () => <Box component="hr" sx={{ my: 2, border: 0, borderTop: '1px solid', borderColor: 'divider' }} />,
    }}
  >{markdown}</ReactMarkdown>;
}
