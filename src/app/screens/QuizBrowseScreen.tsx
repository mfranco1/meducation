import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Alert, Box, Button, Card, CardContent, Container, Drawer, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { answerFor } from '../../domain/quizEngine';
import type { Question, Quiz } from '../../domain/types';
import { FeedbackPanel } from '../components/feedback/FeedbackPanel';
import { ExplanationContent } from '../components/feedback/ExplanationContent';
import { MarkdownContent } from '../components/content/MarkdownContent';

interface QuizBrowseScreenProps {
  quiz: Quiz;
  index: number;
  questions: Question[];
  onNavigate: (index: number) => void;
  onDone: () => void;
}

export function QuizBrowseScreen({ quiz, index, questions, onNavigate, onDone }: QuizBrowseScreenProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const question = questions[index];
  if (!question) return <Container maxWidth="md" sx={{ py: 4 }}><Alert severity="warning">This quiz has no questions to browse.</Alert><Button sx={{ mt: 2 }} onClick={onDone}>Done</Button></Container>;

  const correctAnswer = answerFor(question);
  const hasCorrectChoice = correctAnswer !== undefined && question.choices.some(choice => choice.id === correctAnswer);
  const navigator = <QuestionGrid questions={questions} currentIndex={index} onNavigate={target => { onNavigate(target); setNavigatorOpen(false); }} />;

  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    <IconButton aria-label="Leave answer browser" onClick={onDone} sx={{ p: .5, mb: .5 }}><ArrowBackRoundedIcon /></IconButton>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2" color="text.secondary">{quiz.name} · Question {index + 1} of {questions.length}</Typography></Stack>
    <LinearProgress variant="determinate" value={(index + 1) / questions.length * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} />
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, mt: 3 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Button variant="outlined" size="small" onClick={() => setNavigatorOpen(true)} sx={{ display: { xs: 'inline-flex', md: 'none' }, mb: 2 }}>Questions</Button>
        <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <MarkdownContent markdown={question.stem} variant="stem" />
          <Stack spacing={1.25} sx={{ mt: 3 }}>
            {question.choices.map(choice => {
              const correct = hasCorrectChoice && choice.id === correctAnswer;
              return <Box key={choice.id} sx={{ border: '1px solid', borderColor: correct ? 'success.main' : '#e8dfd9', bgcolor: correct ? '#e4f2e9' : 'background.paper', borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Typography component="span" fontWeight={700} sx={{ flexShrink: 0 }}>{choice.id}.</Typography>
                  <Box sx={{ minWidth: 0, flex: 1 }}><MarkdownContent markdown={choice.text} variant="inline" /></Box>
                </Stack>
              </Box>;
            })}
          </Stack>
          {!hasCorrectChoice
            ? <Box sx={{ mt: 3 }}><Alert severity="warning" sx={{ mb: 2 }}>Answer unavailable</Alert><ExplanationContent question={question} />{question.pearls?.map(pearl => <Box key={pearl} sx={{ mt: 2.5, maxWidth: '72ch', p: 1.5, borderRadius: 2, bgcolor: '#f7dfcf' }}><Typography variant="subtitle2" color="primary.dark">High-yield pearl</Typography><Typography sx={{ mt: .5, lineHeight: 1.65 }}>{pearl}</Typography></Box>)}</Box>
            : <FeedbackPanel question={question} selectedChoiceId={correctAnswer} />}
          {Object.keys(question.choiceExplanations ?? {}).length > 0 && <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Choice explanations</Typography>
            <Stack spacing={1}>{Object.entries(question.choiceExplanations ?? {}).map(([choiceId, explanation]) => <Typography component="div" key={choiceId} variant="body2"><b>{choiceId}.</b> <MarkdownContent markdown={explanation} variant="inline" /></Typography>)}</Stack>
          </Box>}
        </CardContent></Card>
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
          <Button startIcon={<ArrowBackRoundedIcon />} disabled={index === 0} onClick={() => onNavigate(index - 1)}>Previous</Button>
          {index === questions.length - 1
            ? <Button variant="contained" onClick={onDone}>Done</Button>
            : <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => onNavigate(index + 1)}>Next</Button>}
        </Stack>
      </Box>
      <Card component="aside" aria-label="Question navigation" sx={{ display: { xs: 'none', md: 'block' }, width: 270, flexShrink: 0 }}><CardContent sx={{ p: 2 }}>{navigator}</CardContent></Card>
    </Box>
    <Drawer anchor="right" open={navigatorOpen} onClose={() => setNavigatorOpen(false)} PaperProps={{ sx: { width: 'min(100%, 380px)', p: 2.5 } }}>{navigator}</Drawer>
  </Container>;
}

function QuestionGrid({ questions, currentIndex, onNavigate }: { questions: Question[]; currentIndex: number; onNavigate: (index: number) => void }) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const currentTile = currentTileRef.current;
    if (!scrollArea || !currentTile) return;
    const frame = requestAnimationFrame(() => {
      const areaBounds = scrollArea.getBoundingClientRect();
      const tileBounds = currentTile.getBoundingClientRect();
      const tileCenter = tileBounds.top - areaBounds.top + tileBounds.height / 2;
      if (tileCenter >= scrollArea.clientHeight * .25 && tileCenter <= scrollArea.clientHeight * .75) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollArea.scrollTo({ top: scrollArea.scrollTop + tileCenter - scrollArea.clientHeight / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex]);

  return <Box ref={scrollAreaRef} aria-label="Question navigator" sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1, maxHeight: { xs: 'calc(100vh - 110px)', md: 470 }, overflowY: 'auto', p: .75 }}>
    {questions.map((question, itemIndex) => <Button key={question.id} ref={itemIndex === currentIndex ? currentTileRef : undefined} aria-label={`Question ${itemIndex + 1}${itemIndex === currentIndex ? ', current question' : ''}`} aria-current={itemIndex === currentIndex ? 'step' : undefined} onClick={() => onNavigate(itemIndex)} sx={{ aspectRatio: '1 / 1', minWidth: 0, border: '1px solid', borderColor: itemIndex === currentIndex ? 'primary.main' : '#d9dfe7', bgcolor: itemIndex === currentIndex ? '#f7dfcf' : '#fffdfb', '&:focus-visible': { outline: '3px solid #b9511b', outlineOffset: 2 } }}>{itemIndex + 1}</Button>)}
  </Box>;
}
