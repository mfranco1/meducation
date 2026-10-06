import type { ReactNode } from 'react';
import { Box, Button, Card, CardContent, Drawer } from '@mui/material';

interface QuestionNavigationLayoutProps {
  navigator: ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
  itemLabel?: string;
}

/** Provides the shared responsive frame around mode-specific question navigation. */
export function QuestionNavigationLayout({ navigator, open, onOpen, onClose, children, itemLabel = 'Questions' }: QuestionNavigationLayoutProps) {
  return <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mt: 3 }}>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Button variant="outlined" size="small" onClick={onOpen} sx={{ display: { xs: 'inline-flex', md: 'none' }, mb: 2 }}>{itemLabel}</Button>
      {children}
    </Box>
    <Card component="aside" aria-label={`${itemLabel.slice(0, -1)} navigation`} sx={{ display: { xs: 'none', md: 'block' }, width: 270, flexShrink: 0, position: 'sticky', top: 24 }}>
      <CardContent sx={{ p: 2 }}>{navigator}</CardContent>
    </Card>
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 'min(100%, 380px)', p: 2.5 } }}>
      {navigator}
    </Drawer>
  </Box>;
}
