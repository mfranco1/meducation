import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Alert, Box, Button, Card, CardContent, Container, IconButton, LinearProgress, Stack, Typography, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { answerFor, isCorrect } from '../../domain/quizEngine';
import type { CompletedAttempt, Question, Quiz } from '../../domain/types';
import { formatDuration } from '../format';
import { MarkdownContent } from '../components/content/MarkdownContent';
import { ExplanationContent } from '../components/feedback/ExplanationContent';
import { QuestionNavigationLayout } from '../components/quiz/QuestionNavigationLayout';
import { QuestionNavigator, type QuestionNavigatorFilter } from '../components/quiz/QuestionNavigator';

interface QuizReviewScreenProps {
  quiz: Quiz;
  attempt: CompletedAttempt;
  index: number;
  questions: Question[];
  onNavigate: (index: number) => void;
  onRequestExit: () => void;
}

export function QuizReviewScreen({ quiz, attempt, index, questions, onNavigate, onRequestExit }: QuizReviewScreenProps) {
  const theme = useTheme();
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const question = questions[index];
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);
  if (!question) return <Container maxWidth="md" sx={{ py: 4 }}><Alert severity="warning">This quiz has no questions to review.</Alert><Button sx={{ mt: 2 }} onClick={onRequestExit}>Leave review</Button></Container>;

  const selectedChoiceId = attempt.responses[question.id]?.selectedChoiceId;
  const correctAnswer = answerFor(question);
  const answerUnderReview = Boolean(question.rationaleMeta?.answerReviewNote);
  const hasCorrectChoice = correctAnswer !== undefined && question.choices.some(choice => choice.id === correctAnswer);
  const status = !selectedChoiceId ? 'Unanswered' : answerUnderReview ? 'Answer key under review' : isCorrect(question, selectedChoiceId) ? 'Correct' : 'Incorrect';
  const statusTone = !selectedChoiceId || answerUnderReview ? 'warning.main' : isCorrect(question, selectedChoiceId) ? 'success.main' : 'error.main';
  const navigator = <QuestionNavigator questions={questions} attempt={attempt} currentIndex={index} filter={navigatorFilter} onFilterChange={setNavigatorFilter} onNavigate={target => { onNavigate(target); setNavigatorOpen(false); }} revealAnswers />;

  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    <IconButton aria-label="Leave review" onClick={onRequestExit} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={.5}>
      <Typography variant="body2" color="text.secondary">{quiz.name} · Review · Question {index + 1} of {questions.length}</Typography>
      <Typography variant="body2" color="text.secondary">Final time: {formatDuration(attempt.score.elapsedMs)}</Typography>
    </Stack>
    <LinearProgress variant="determinate" value={(index + 1) / questions.length * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} />
    <QuestionNavigationLayout navigator={navigator} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)}>
      <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" />
        <Stack spacing={1.25} sx={{ mt: 3 }}>
          {question.choices.map(choice => {
            const selected = choice.id === selectedChoiceId;
            const correct = hasCorrectChoice && choice.id === correctAnswer;
            const revealedCorrect = correct && !answerUnderReview;
            const revealedIncorrect = selected && !revealedCorrect && !answerUnderReview;
            return <Box key={choice.id} sx={{ border: '1px solid', borderColor: revealedCorrect ? 'success.main' : revealedIncorrect ? 'error.main' : selected ? 'primary.main' : theme.palette.feedback.choiceBorder, bgcolor: revealedCorrect ? theme.palette.feedback.correct.surface : revealedIncorrect ? theme.palette.feedback.incorrect.surface : 'background.paper', borderRadius: 1, p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="flex-start"><Typography component="span" fontWeight={700} sx={{ flexShrink: 0 }}>{choice.id}.</Typography><Box sx={{ minWidth: 0, flex: 1 }}><MarkdownContent markdown={choice.text} variant="inline" />{selected && <Typography variant="caption" display="block" fontWeight={700} sx={{ mt: .75 }}>Your answer</Typography>}{revealedCorrect && <Typography variant="caption" display="block" fontWeight={700} sx={{ mt: .75 }}>Correct answer</Typography>}</Box></Stack>
            </Box>;
          })}
        </Stack>
        <Box sx={{ mt: 3, overflow: 'hidden', border: '1px solid', borderColor: statusTone, borderRadius: 1, bgcolor: 'background.paper' }}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, bgcolor: answerUnderReview ? theme.palette.feedback.review.surface : !selectedChoiceId ? theme.palette.warning.light : isCorrect(question, selectedChoiceId) ? theme.palette.feedback.correct.surface : theme.palette.feedback.incorrect.surface }}><Typography fontWeight={800}>{status}</Typography></Box>
          <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 2.75 } }}><ExplanationContent question={question} />{question.pearls?.map(pearl => <Box key={pearl} sx={{ mt: 2.5, maxWidth: '72ch', p: 1.5, borderRadius: 2, bgcolor: 'primary.light' }}><Typography variant="subtitle2" color="primary.dark">High-yield pearl</Typography><Typography sx={{ mt: .5, lineHeight: 1.65 }}>{pearl}</Typography></Box>)}</Box>
        </Box>
        {Object.keys(question.choiceExplanations ?? {}).length > 0 && <Box sx={{ mt: 3 }}><Typography variant="subtitle2" sx={{ mb: 1 }}>Choice explanations</Typography><Stack spacing={1}>{Object.entries(question.choiceExplanations ?? {}).map(([choiceId, explanation]) => <Typography component="div" key={choiceId} variant="body2"><b>{choiceId}.</b> <MarkdownContent markdown={explanation} variant="inline" /></Typography>)}</Stack></Box>}
      </CardContent></Card>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
        <Button startIcon={<ArrowBackRoundedIcon />} disabled={index === 0} onClick={() => onNavigate(index - 1)}>Previous</Button>
        {index === questions.length - 1 ? <Button variant="contained" onClick={onRequestExit}>Done</Button> : <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => onNavigate(index + 1)}>Next</Button>}
      </Stack>
    </QuestionNavigationLayout>
  </Container>;
}
