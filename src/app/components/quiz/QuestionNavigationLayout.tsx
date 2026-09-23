import type { ReactNode } from 'react';
import { Box, Button, Card, CardContent, Drawer } from '@mui/material';

interface QuestionNavigationLayoutProps {
  navigator: ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}

/** Provides the shared responsive frame around mode-specific question navigation. */
export function QuestionNavigationLayout({ navigator, open, onOpen, onClose, children }: QuestionNavigationLayoutProps) {
  return <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mt: 3 }}>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Button variant="outlined" size="small" onClick={onOpen} sx={{ display: { xs: 'inline-flex', md: 'none' }, mb: 2 }}>Questions</Button>
      {children}
    </Box>
    <Card component="aside" aria-label="Question navigation" sx={{ display: { xs: 'none', md: 'block' }, width: 270, flexShrink: 0 }}>
      <CardContent sx={{ p: 2 }}>{navigator}</CardContent>
    </Card>
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 'min(100%, 380px)', p: 2.5 } }}>
      {navigator}
    </Drawer>
  </Box>;
}
