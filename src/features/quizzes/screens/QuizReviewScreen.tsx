import FlagIcon from '@mui/icons-material/Flag';
import { Alert, Box, Button, Card, CardContent, Container, Stack } from '@mui/material';
import { useRef, useState } from 'react';
import { answerFor, isCorrect } from '../../../domain/quizEngine';
import type { CompletedAttempt, Question, Quiz } from '../../../domain/types';
import { MarkdownContent } from '../../../shared/ui/content/MarkdownContent';
import { FeedbackPanel, type ReadOnlyFeedbackStatus } from '../components/feedback/FeedbackPanel';
import { QuestionNavigationLayout } from '../../../shared/ui/study/QuestionNavigationLayout';
import { SwapTransition } from '../../../shared/ui/transitions/SwapTransition';
import {
  QuestionNavigator,
  adjacentQuestionIndexes,
  questionNavigationItems,
  type QuestionNavigatorFilter,
} from '../components/quiz/QuestionNavigator';
import { ReadOnlyChoiceList } from '../components/quiz/ReadOnlyChoiceList';
import { ReadOnlyQuizFooter, ReadOnlyQuizHeader } from '../components/quiz/ReadOnlyQuizChrome';
import { useStudyArrowNavigation } from '../../../shared/ui/study/useStudyArrowNavigation';

interface QuizReviewScreenProps {
  quiz: Quiz;
  attempt: CompletedAttempt;
  index: number;
  questions: Question[];
  contentChanged?: boolean;
  onNavigate: (index: number) => void;
  onRequestExit: () => void;
}

export function QuizReviewScreen({
  attempt,
  index,
  questions,
  contentChanged = false,
  onNavigate,
  onRequestExit,
}: QuizReviewScreenProps) {
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const nextRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<HTMLButtonElement>(null);
  const { previous, next } = adjacentQuestionIndexes(
    questionNavigationItems(questions, attempt, true),
    navigatorFilter,
    index,
  );
  useStudyArrowNavigation({
    index,
    total: questions.length,
    disabled: navigatorOpen,
    hasPrevious: previous !== undefined,
    hasNext: next !== undefined,
    onPrevious: () => previous !== undefined && onNavigate(previous),
    onNext: () => next !== undefined && onNavigate(next),
    nextButtonRef: nextRef,
    finishButtonRef: finishRef,
  });
  const question = questions[index];
  if (!question)
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="warning">This quiz has no questions to review.</Alert>
        <Button sx={{ mt: 2 }} onClick={onRequestExit}>
          Leave review
        </Button>
      </Container>
    );

  const selectedChoiceId = attempt.responses[question.id]?.selectedChoiceId;
  const correctAnswer = answerFor(question);
  const hasCorrectChoice =
    correctAnswer !== undefined && question.choices.some((choice) => choice.id === correctAnswer);
  const status: ReadOnlyFeedbackStatus = !hasCorrectChoice
    ? 'unavailable'
    : !selectedChoiceId
      ? 'unanswered'
      : isCorrect(question, selectedChoiceId)
        ? 'correct'
        : 'incorrect';
  const navigator = (
    <QuestionNavigator
      questions={questions}
      attempt={attempt}
      currentIndex={index}
      filter={navigatorFilter}
      onFilterChange={setNavigatorFilter}
      onNavigate={(target) => {
        onNavigate(target);
        setNavigatorOpen(false);
      }}
      revealAnswers
      filterSet="review"
    />
  );

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
      {contentChanged && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This quiz changed after you took it. Some questions may differ.
        </Alert>
      )}
      <ReadOnlyQuizHeader
        index={index}
        total={questions.length}
        mode="Review results"
        exitLabel="Leave review"
        onExit={onRequestExit}
        finalTimeMs={attempt.score.elapsedMs}
      />
      <QuestionNavigationLayout
        navigator={navigator}
        open={navigatorOpen}
        onOpen={() => setNavigatorOpen(true)}
        onClose={() => setNavigatorOpen(false)}
      >
        <SwapTransition swapKey={index}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" />
                </Box>
                {attempt.responses[question.id]?.flagged && (
                  <Box
                    role="img"
                    aria-label="Flagged question"
                    sx={{ flexShrink: 0, mt: 0.5, color: 'primary.main', lineHeight: 0 }}
                  >
                    <FlagIcon />
                  </Box>
                )}
              </Stack>
              <ReadOnlyChoiceList
                question={question}
                selectedChoiceId={selectedChoiceId}
                correctChoiceId={hasCorrectChoice ? correctAnswer : undefined}
                mode="review"
              />
              <FeedbackPanel question={question} selectedChoiceId={selectedChoiceId} readOnlyStatus={status} />
            </CardContent>
          </Card>
        </SwapTransition>
        <ReadOnlyQuizFooter
          index={index}
          total={questions.length}
          previousIndex={previous}
          nextIndex={next}
          onNavigate={onNavigate}
          onDone={onRequestExit}
          nextButtonRef={nextRef}
          finishButtonRef={finishRef}
        />
      </QuestionNavigationLayout>
    </Container>
  );
}
