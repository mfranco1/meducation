import FlagIcon from '@mui/icons-material/Flag';
import { Alert, Box, Button, Card, CardContent, Container, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { answerFor, isCorrect } from '../../domain/quizEngine';
import type { CompletedAttempt, Question, Quiz } from '../../domain/types';
import { MarkdownContent } from '../components/content/MarkdownContent';
import { ChoiceExplanations } from '../components/feedback/ChoiceExplanations';
import { FeedbackPanel, type ReadOnlyFeedbackStatus } from '../components/feedback/FeedbackPanel';
import { QuestionNavigationLayout } from '../components/quiz/QuestionNavigationLayout';
import { QuestionNavigator, type QuestionNavigatorFilter } from '../components/quiz/QuestionNavigator';
import { ReadOnlyChoiceList } from '../components/quiz/ReadOnlyChoiceList';
import { ReadOnlyQuizFooter, ReadOnlyQuizHeader } from '../components/quiz/ReadOnlyQuizChrome';

interface QuizReviewScreenProps {
  quiz: Quiz;
  attempt: CompletedAttempt;
  index: number;
  questions: Question[];
  onNavigate: (index: number) => void;
  onRequestExit: () => void;
}

export function QuizReviewScreen({ attempt, index, questions, onNavigate, onRequestExit }: QuizReviewScreenProps) {
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
  const status: ReadOnlyFeedbackStatus = !hasCorrectChoice ? 'unavailable' : !selectedChoiceId ? 'unanswered' : answerUnderReview ? 'review' : isCorrect(question, selectedChoiceId) ? 'correct' : 'incorrect';
  const navigator = <QuestionNavigator questions={questions} attempt={attempt} currentIndex={index} filter={navigatorFilter} onFilterChange={setNavigatorFilter} onNavigate={target => { onNavigate(target); setNavigatorOpen(false); }} revealAnswers filterSet="review" />;

  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    <ReadOnlyQuizHeader index={index} total={questions.length} mode="Review results" exitLabel="Leave review" onExit={onRequestExit} finalTimeMs={attempt.score.elapsedMs} />
    <QuestionNavigationLayout navigator={navigator} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)}>
      <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" />
          {attempt.responses[question.id]?.flagged && <Box role="img" aria-label="Flagged question" sx={{ flexShrink: 0, mt: .5, color: 'primary.main', lineHeight: 0 }}><FlagIcon /></Box>}
        </Stack>
        <ReadOnlyChoiceList question={question} selectedChoiceId={selectedChoiceId} correctChoiceId={hasCorrectChoice ? correctAnswer : undefined} answerUnderReview={answerUnderReview} mode="review" />
        <FeedbackPanel question={question} selectedChoiceId={selectedChoiceId} readOnlyStatus={status} />
        <ChoiceExplanations question={question} />
      </CardContent></Card>
      <ReadOnlyQuizFooter index={index} total={questions.length} onNavigate={onNavigate} onDone={onRequestExit} />
    </QuestionNavigationLayout>
  </Container>;
}
