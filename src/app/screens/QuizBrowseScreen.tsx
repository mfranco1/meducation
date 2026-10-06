import { Alert, Box, Button, Card, CardContent, Container } from '@mui/material';
import { useRef, useState } from 'react';
import { answerFor } from '../../domain/quizEngine';
import type { Question, Quiz } from '../../domain/types';
import { FeedbackPanel } from '../components/feedback/FeedbackPanel';
import { ChoiceExplanations } from '../components/feedback/ChoiceExplanations';
import { MarkdownContent } from '../../shared/ui/content/MarkdownContent';
import { QuestionNavigationLayout } from '../../shared/ui/study/QuestionNavigationLayout';
import { QuestionTile } from '../components/quiz/QuestionNavigator';
import { ReadOnlyChoiceList } from '../components/quiz/ReadOnlyChoiceList';
import { ReadOnlyQuizFooter, ReadOnlyQuizHeader } from '../components/quiz/ReadOnlyQuizChrome';
import { useScrollCurrentQuestion } from '../../shared/ui/study/useScrollCurrentQuestion';

interface QuizBrowseScreenProps {
  quiz: Quiz;
  index: number;
  questions: Question[];
  onNavigate: (index: number) => void;
  onDone: () => void;
}

export function QuizBrowseScreen({ index, questions, onNavigate, onDone }: QuizBrowseScreenProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const question = questions[index];
  if (!question) return <Container maxWidth="md" sx={{ py: 4 }}><Alert severity="warning">This quiz has no questions to browse.</Alert><Button sx={{ mt: 2 }} onClick={onDone}>Done</Button></Container>;

  const correctAnswer = answerFor(question);
  const hasCorrectChoice = correctAnswer !== undefined && question.choices.some(choice => choice.id === correctAnswer);
  const navigator = <QuestionGrid questions={questions} currentIndex={index} onNavigate={target => { onNavigate(target); setNavigatorOpen(false); }} />;

  return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
    <ReadOnlyQuizHeader index={index} total={questions.length} mode="Browse answers" exitLabel="Leave answer browser" onExit={onDone} />
    <QuestionNavigationLayout navigator={navigator} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)}>
        <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" />
          <ReadOnlyChoiceList question={question} correctChoiceId={hasCorrectChoice ? correctAnswer : undefined} answerUnderReview={Boolean(question.rationaleMeta?.answerReviewNote)} mode="browse" />
          {!hasCorrectChoice
            ? <FeedbackPanel question={question} readOnlyStatus="unavailable" />
            : <FeedbackPanel question={question} selectedChoiceId={correctAnswer} />}
          <ChoiceExplanations question={question} />
        </CardContent></Card>
        <ReadOnlyQuizFooter index={index} total={questions.length} onNavigate={onNavigate} onDone={onDone} />
    </QuestionNavigationLayout>
  </Container>;
}

function QuestionGrid({ questions, currentIndex, onNavigate }: { questions: Question[]; currentIndex: number; onNavigate: (index: number) => void }) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLButtonElement>(null);

  useScrollCurrentQuestion(scrollAreaRef, currentTileRef, [currentIndex]);

  return <Box ref={scrollAreaRef} aria-label="Question navigator" sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1, maxHeight: { xs: 'calc(100vh - 110px)', md: 470 }, overflowY: 'auto', p: .75 }}>
    {questions.map((question, itemIndex) => <QuestionTile key={question.id} item={{ index: itemIndex, number: itemIndex + 1, answered: false, flagged: false, wrong: false }} current={itemIndex === currentIndex} tileRef={itemIndex === currentIndex ? currentTileRef : undefined} onClick={() => onNavigate(itemIndex)} showAnswerStatus={false} />)}
  </Box>;
}
