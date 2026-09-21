import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Button, Card, CardContent, Dialog, DialogContent, DialogTitle, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { FeedbackMode, Quiz } from '../../../domain/types';

interface QuizSetupDialogProps {
  open: boolean;
  quiz: Quiz;
  onClose: () => void;
  onStart: (quiz: Quiz, mode: FeedbackMode) => void;
}

export function QuizSetupDialog({ open, quiz, onClose, onStart }: QuizSetupDialogProps) {
  const [mode, setMode] = useState<FeedbackMode>('immediate');

  useEffect(() => {
    if (open) setMode('immediate');
  }, [open, quiz.id]);

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="quiz-setup-dialog-title">
    <DialogTitle id="quiz-setup-dialog-title" variant="h4" sx={{ pt: 4, pr: 6, position: 'relative' }}>
      {quiz.name}
      <IconButton aria-label="Close quiz setup" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseRoundedIcon /></IconButton>
    </DialogTitle>
    <DialogContent>
      <Card><CardContent><Typography variant="h6">Learning Mode</Typography>
        <ToggleButtonGroup value={mode} exclusive onChange={(_, value) => value && setMode(value)} fullWidth sx={{ mt: 2 }}>
          <ToggleButton value="immediate">Fast Feedback</ToggleButton><ToggleButton value="exam">Exam Mode</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{mode === 'immediate' ? 'Selecting an answer locks it and shows the explanation right away.' : 'Answers remain hidden until you finish and submit the entire test.'}</Typography>
        <Button fullWidth variant="contained" size="large" sx={{ mt: 4 }} onClick={() => onStart(quiz, mode)}>Begin quiz</Button>
      </CardContent></Card>
    </DialogContent>
  </Dialog>;
}
