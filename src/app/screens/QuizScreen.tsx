import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { useEffect, useRef, useState } from 'react';
import { Box, Card, CardContent, Container, FormControlLabel, IconButton, Radio, RadioGroup, Stack, Typography, useTheme } from '@mui/material';
import { MarkdownContent } from '../../shared/ui/content/MarkdownContent';
import { blankResponse, commitAnswer, isCorrect, updateResponse } from '../../domain/quizEngine';
import type { Attempt, Question, Quiz } from '../../domain/types';
import { CelebrationOverlay } from '../components/celebration/CelebrationOverlay';
import { celebrationForStreak, type CelebrationEvent } from '../components/celebration/celebrationCatalog';
import { RadiatingCircles } from '../components/celebration/RadiatingCircles';
import { shouldTriggerCorrectAnswerBurst } from '../components/celebration/correctAnswerBurst';
import { FeedbackPanel } from '../components/feedback/FeedbackPanel';
import { QuestionNavigator, type QuestionNavigatorFilter } from '../components/quiz/QuestionNavigator';
import { QuestionNavigationLayout } from '../../shared/ui/study/QuestionNavigationLayout';
import { Stopwatch } from '../components/quiz/Stopwatch';
import { SubmitQuizDialog } from '../components/quiz/SubmitQuizDialog';
import { StudyHeader, StudyNavigationFooter } from '../../shared/ui/study/StudyHeader';

interface QuizScreenProps {
  quiz: Quiz;
  attempt: Attempt;
  index: number;
  questions: Question[];
  onCheckpoint: (attempt: Attempt, index?: number) => void;
  onFinish: () => void;
  onRequestExit: () => void;
}

interface CorrectAnswerBurst { questionId: string; choiceId: string; eventId: number }

export function QuizScreen({ attempt, index, questions, onCheckpoint, onFinish, onRequestExit }: QuizScreenProps) {
  const theme = useTheme();
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const [celebrationQueue, setCelebrationQueue] = useState<CelebrationEvent[]>([]);
  const [correctAnswerBurst, setCorrectAnswerBurst] = useState<CorrectAnswerBurst>();
  const [submitOpen, setSubmitOpen] = useState(false);
  const correctAnswerBurstSequence = useRef(0);
  const submissionRequested = useRef(false);
  const question = questions[index];
  const savedResponse = attempt.responses[question.id];
  const response = savedResponse ?? blankResponse(question.id);
  const feedback = response.locked && attempt.feedbackMode === 'immediate';
  const answerUnderReview = Boolean(question.rationaleMeta?.answerReviewNote);
  const select = (choice: string) => {
    if (response.locked) return;
    const result = commitAnswer(attempt, question, choice);
    onCheckpoint(result.attempt);
    if (shouldTriggerCorrectAnswerBurst({ feedbackMode: attempt.feedbackMode, answerCorrect: isCorrect(question, choice), answerUnderReview, responseLocked: response.locked })) {
      setCorrectAnswerBurst({ questionId: question.id, choiceId: choice, eventId: ++correctAnswerBurstSequence.current });
    }
    if (result.streakMilestone) setCelebrationQueue(queue => [...queue, celebrationForStreak(result.streakMilestone!)]);
  };
  const toggleFlag = () => onCheckpoint(updateResponse(attempt, { ...response, flagged: !response.flagged }));
  const navigateToQuestion = (targetIndex: number) => {
    setCorrectAnswerBurst(undefined);
    onCheckpoint(attempt, targetIndex);
    setNavigatorOpen(false);
  };
  const requestSubmit = () => {
    submissionRequested.current = false;
    setSubmitOpen(true);
  };
  const confirmSubmit = () => {
    if (submissionRequested.current) return;
    submissionRequested.current = true;
    setSubmitOpen(false);
    onFinish();
  };

  useEffect(() => {
    if (!correctAnswerBurst) return;
    const timer = window.setTimeout(() => setCorrectAnswerBurst(undefined), 950);
    return () => window.clearTimeout(timer);
  }, [correctAnswerBurst]);
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
    <StudyHeader itemLabel="Question" index={index} total={questions.length} exitLabel="Leave test" onExit={onRequestExit} trailing={<Stopwatch attempt={attempt} />} />
    <QuestionNavigationLayout navigator={navigator} open={navigatorOpen} onOpen={() => setNavigatorOpen(true)} onClose={() => setNavigatorOpen(false)}>
        <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" />
            <IconButton size="small" aria-label={response.flagged ? 'Remove question flag' : 'Flag question'} sx={{ p: 0, mt: .5, flexShrink: 0 }} onClick={toggleFlag}>{response.flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}</IconButton>
          </Stack>
          <RadioGroup value={response.selectedChoiceId ?? ''} onChange={(_, choice) => select(choice)} sx={{ mt: 3, gap: 1.25 }}>
            {question.choices.map(choice => {
              const selected = response.selectedChoiceId === choice.id;
              const correct = isCorrect(question, choice.id);
              const state = feedback && !answerUnderReview ? correct ? theme.palette.feedback.correct.surface : selected ? theme.palette.feedback.incorrect.surface : undefined : undefined;
              const showCorrectAnswerBurst = correctAnswerBurst?.questionId === question.id && correctAnswerBurst.choiceId === choice.id;
              return <Box key={choice.id} sx={{ position: 'relative', isolation: 'isolate', overflow: 'visible', border: '1px solid', borderColor: selected ? 'primary.main' : theme.palette.feedback.choiceBorder, bgcolor: state, borderRadius: 1, p: .5 }}>
                {showCorrectAnswerBurst && <RadiatingCircles key={correctAnswerBurst.eventId} particleCount={5} durationMs={900} horizontalSpread={14} verticalSpread={17} particleSize={7} />}
                <FormControlLabel disabled={response.locked} value={choice.id} control={<Radio sx={feedback && !answerUnderReview && correct ? { color: 'success.main', '&.Mui-checked, &.Mui-disabled': { color: 'success.main' } } : undefined} />} label={<Typography component="div" sx={{ py: .8 }}><b>{choice.id}.</b> <MarkdownContent markdown={choice.text} variant="inline" /></Typography>} sx={{ m: 0, width: '100%', position: 'relative', zIndex: 1 }} />
              </Box>;
            })}
          </RadioGroup>
          {feedback && <FeedbackPanel question={question} selectedChoiceId={response.selectedChoiceId} />}
        </CardContent></Card>
        <StudyNavigationFooter index={index} total={questions.length} onPrevious={() => navigateToQuestion(index - 1)} onNext={() => navigateToQuestion(index + 1)} onFinish={requestSubmit} finishLabel={attempt.feedbackMode === 'exam' ? 'Submit' : 'Finish'} nextLabel={feedback ? 'Continue' : 'Next'} />
    </QuestionNavigationLayout>
    <SubmitQuizDialog open={submitOpen} onClose={() => setSubmitOpen(false)} onConfirm={confirmSubmit} />
  </Container>;
}
