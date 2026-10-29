import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Button, Card, CardContent, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { FeedbackMode, Quiz } from '../../../../domain/types';

type SetupMode = FeedbackMode | 'browse';

interface QuizSetupDialogProps {
  open: boolean;
  quiz: Quiz;
  onClose: () => void;
  onStart: (quiz: Quiz, mode: FeedbackMode, shuffle: boolean) => void;
  onBrowse: (quiz: Quiz) => void;
}

export function QuizSetupDialog({ open, quiz, onClose, onStart, onBrowse }: QuizSetupDialogProps) {
  const [mode, setMode] = useState<SetupMode>('immediate');
  const [shuffle, setShuffle] = useState(true);

  useEffect(() => {
    if (open) { setMode('immediate'); setShuffle(true); }
  }, [open, quiz.id]);

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="quiz-setup-dialog-title">
    <DialogTitle id="quiz-setup-dialog-title" variant="h4" sx={{ pt: 4, pr: 6, position: 'relative' }}>
      {quiz.name}
      <IconButton aria-label="Close quiz setup" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseRoundedIcon /></IconButton>
    </DialogTitle>
    <DialogContent>
      <Card><CardContent><Typography variant="h6">Learning Mode</Typography>
        <ToggleButtonGroup value={mode} exclusive onChange={(_, value: SetupMode | null) => value && setMode(value)} fullWidth sx={{ mt: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { flex: '1 1 30%', px: 1, lineHeight: 1.2 } }}>
          <ToggleButton value="immediate">Fast Feedback</ToggleButton><ToggleButton value="exam">Exam Mode</ToggleButton>{import.meta.env.DEV && <ToggleButton value="browse">Browse Answers</ToggleButton>}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{mode === 'immediate' ? 'Selecting an answer locks it and shows the explanation right away.' : mode === 'exam' ? 'Answers remain hidden until you finish and submit the entire test.' : 'Browse every question with the correct answer and explanation shown. Nothing is recorded.'}</Typography>
        {import.meta.env.DEV && mode !== 'browse' && <FormControlLabel sx={{ mt: 2, display: 'flex' }} control={<Switch checked={shuffle} onChange={(_, checked) => setShuffle(checked)} />} label="Shuffle questions and choices" />}
        <Button fullWidth variant="contained" size="large" sx={{ mt: 4 }} onClick={() => mode === 'browse' ? onBrowse(quiz) : onStart(quiz, mode, shuffle)}>{mode === 'browse' ? 'Open quiz' : 'Begin Quiz'}</Button>
      </CardContent></Card>
    </DialogContent>
  </Dialog>;
}
