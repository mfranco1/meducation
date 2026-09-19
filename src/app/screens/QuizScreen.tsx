import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { useState } from 'react';
import { Box, Button, Card, CardContent, Container, Drawer, FormControlLabel, IconButton, LinearProgress, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { explanationFor } from '../../content/explanationCatalog';
import { blankResponse, commitAnswer, isCorrect, updateResponse } from '../../domain/quizEngine';
import type { Attempt, Question, Quiz } from '../../domain/types';
import { CelebrationOverlay } from '../components/celebration/CelebrationOverlay';
import { celebrationForStreak, type CelebrationEvent } from '../components/celebration/celebrationCatalog';
import { FeedbackPanel } from '../components/feedback/FeedbackPanel';
import { QuestionNavigator, type QuestionNavigatorFilter } from '../components/quiz/QuestionNavigator';
import { Stopwatch } from '../components/quiz/Stopwatch';

interface QuizScreenProps {
  quiz: Quiz;
  attempt: Attempt;
  index: number;
  questions: Question[];
  onCheckpoint: (attempt: Attempt, index?: number) => void;
  onFinish: () => void;
  onRequestExit: () => void;
}

export function QuizScreen({ quiz, attempt, index, questions, onCheckpoint, onFinish, onRequestExit }: QuizScreenProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEvent[]>([]);
  const question = questions[index];
  const savedResponse = attempt.responses[question.id];
  const response = savedResponse ?? blankResponse(question.id);
  const feedback = response.locked && attempt.feedbackMode === 'immediate';
  const answerUnderReview = Boolean(explanationFor(question)?.answerReviewNote);
  const select = (choice: string) => {
    if (response.locked) return;
    const result = commitAnswer(attempt, question, choice);
    onCheckpoint(result.attempt);
    if (result.streakMilestone) setCelebrationQueue(queue => [...queue, celebrationForStreak(result.streakMilestone!)]);
  };
  const toggleFlag = () => onCheckpoint(updateResponse(attempt, { ...response, flagged: !response.flagged }));
  const navigateToQuestion = (targetIndex: number) => {
    onCheckpoint(attempt, targetIndex);
    setNavigatorOpen(false);
  };
  const navigator = <QuestionNavigator
    questions={questions}
    attempt={attempt}
    currentIndex={index}
    filter={navigatorFilter}
    onFilterChange={setNavigatorFilter}
    onNavigate={navigateToQuestion}
  />;

  const celebration = celebrationQueue[0];
  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    {celebration && <CelebrationOverlay key={celebration.id} open title={celebration.title} message={celebration.message} variant={celebration.variant} onComplete={() => setCelebrationQueue(queue => queue.slice(1))} />}
    <IconButton aria-label="Leave test" onClick={onRequestExit} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2" color="text.secondary">Question {index + 1} of {questions.length}</Typography><Stopwatch attempt={attempt} /></Stack>
    <LinearProgress variant="determinate" value={(index + 1) / questions.length * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} />
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mt: 3 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Button variant="outlined" size="small" onClick={() => setNavigatorOpen(true)} sx={{ display: { xs: 'inline-flex', md: 'none' }, mb: 2 }}>Questions</Button>
        <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Typography variant="h5" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{question.stem}</Typography>
            <IconButton size="small" aria-label={response.flagged ? 'Remove question flag' : 'Flag question'} sx={{ p: 0, mt: .5, flexShrink: 0 }} onClick={toggleFlag}>{response.flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}</IconButton>
          </Stack>
          <RadioGroup value={response.selectedChoiceId ?? ''} onChange={(_, choice) => select(choice)} sx={{ mt: 3, gap: 1.25 }}>
            {question.choices.map(choice => {
              const selected = response.selectedChoiceId === choice.id;
              const correct = isCorrect(question, choice.id);
              const state = feedback && !answerUnderReview ? correct ? '#e4f2e9' : selected ? '#fae9e6' : undefined : undefined;
              return <Box key={choice.id} sx={{ border: '1px solid', borderColor: selected ? 'primary.main' : '#e8dfd9', bgcolor: state, borderRadius: 1, p: .5 }}>
                <FormControlLabel disabled={response.locked} value={choice.id} control={<Radio />} label={<Typography sx={{ py: .8 }}><b>{choice.id}.</b> {choice.text}</Typography>} sx={{ m: 0, width: '100%' }} />
              </Box>;
            })}
          </RadioGroup>
          {feedback && <FeedbackPanel question={question} selectedChoiceId={response.selectedChoiceId} />}
        </CardContent></Card>
        <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ mt: 3 }}><Stack direction="row" spacing={1}>
          <Button startIcon={<ArrowBackRoundedIcon />} disabled={index === 0} onClick={() => onCheckpoint(attempt, index - 1)}>Previous</Button>
          {index === questions.length - 1
            ? <Button variant="contained" onClick={onFinish}>{attempt.feedbackMode === 'exam' ? 'Submit test' : 'Finish'}</Button>
            : <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => onCheckpoint(attempt, index + 1)}>{feedback ? 'Continue' : 'Next'}</Button>}
        </Stack></Stack>
      </Box>
      <Card component="aside" aria-label="Question navigation" sx={{ display: { xs: 'none', md: 'block' }, width: 270, flexShrink: 0 }}><CardContent sx={{ p: 2 }}>{navigator}</CardContent></Card>
    </Box>
    <Drawer anchor="right" open={navigatorOpen} onClose={() => setNavigatorOpen(false)} PaperProps={{ sx: { width: 'min(100%, 380px)', p: 2.5 } }}>
      {navigator}
    </Drawer>
  </Container>;
}
