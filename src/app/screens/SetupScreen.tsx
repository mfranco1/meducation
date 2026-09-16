import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Button, Card, CardContent, Container, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import type { FeedbackMode, Quiz, Subject } from '../../domain/types';

export function SetupScreen({ subject, quiz, onBack, onStart }: { subject: Subject; quiz: Quiz; onBack: () => void; onStart: (quiz: Quiz, mode: FeedbackMode) => void }) {
  const [mode, setMode] = useState<FeedbackMode>('immediate');
  return <Container maxWidth="sm" sx={{ py: 7 }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} color="inherit">Back</Button>
    <Typography variant="h3" sx={{ mt: 3 }}>{subject.name}</Typography>
    <Typography color="text.secondary" variant="h4" sx={{ mt: 1 }}>{quiz.name}</Typography>
    <Card sx={{ mt: 4 }}><CardContent><Typography variant="h6">Learning Mode</Typography>
      <ToggleButtonGroup value={mode} exclusive onChange={(_, value) => value && setMode(value)} fullWidth sx={{ mt: 2 }}>
        <ToggleButton value="immediate">Fast Feedback</ToggleButton><ToggleButton value="exam">Exam Mode</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{mode === 'immediate' ? 'Selecting an answer locks it and shows the explanation right away.' : 'Answers remain hidden until you finish and submit the entire test.'}</Typography>
      <Button fullWidth variant="contained" size="large" sx={{ mt: 4 }} onClick={() => onStart(quiz, mode)}>Begin quiz</Button>
    </CardContent></Card>
  </Container>;
}
