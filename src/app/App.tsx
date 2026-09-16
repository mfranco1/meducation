import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, IconButton, LinearProgress, Radio, RadioGroup, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlagIcon from '@mui/icons-material/Flag';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { questionBank, questions } from '../content/questionBank';
import { LocalAttemptRepository } from '../persistence/localRepository';
import { blankResponse, elapsedTimeFor, isCorrect, normalizeResponseForFeedbackMode, pauseAttempt, questionIndexFor, resumeAttempt, scoreAttempt, selectChoice, updateResponse } from '../domain/quizEngine';
import type { Attempt, CompletedAttempt, FeedbackMode, Question, Quiz, Subject } from '../domain/types';
import { performanceBy } from '../analytics/analytics';
import { explanationFor, parseExplanation, type ExplanationBlock } from '../content/explanations';

const repository = new LocalAttemptRepository();
const duration = (ms: number) => String(Math.floor(ms / 60000)).padStart(2, '0') + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');

function Stopwatch({ attempt }: { attempt: Attempt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <Stack direction="row" spacing={.75} alignItems="center"><TimerOutlinedIcon fontSize="small" /><Typography fontWeight={700}>{duration(elapsedTimeFor(attempt, now))}</Typography></Stack>;
}

function InlineExplanationText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return <>{parts.map((part, index): ReactNode => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  })}</>;
}

function ExplanationList({ block }: { block: Extract<ExplanationBlock, { type: 'list' }> }) {
  return <Box component={block.ordered ? 'ol' : 'ul'} sx={{ my: 0, pl: 3, '& li + li': { mt: .65 } }}>{block.items.map((item, itemIndex) => <li key={itemIndex}>
    <Typography component="span" sx={{ lineHeight: 1.7 }}><InlineExplanationText text={item.text} /></Typography>
    {item.children?.map((child, childIndex) => child.type === 'list' ? <Box key={childIndex} sx={{ mt: .65 }}><ExplanationList block={child} /></Box> : <Typography key={childIndex} sx={{ mt: .65, lineHeight: 1.7 }}><InlineExplanationText text={child.text} /></Typography>)}
  </li>)}</Box>;
}

function ExplanationContent({ question }: { question: Question }) {
  const explanation = explanationFor(question);
  if (!explanation) return null;
  return <Box sx={{ maxWidth: '72ch' }}>
    <Typography variant="subtitle2" sx={{ mb: .75, color: 'text.secondary', letterSpacing: '.02em', textTransform: 'uppercase' }}>Explanation</Typography>
    {explanation.answerReviewNote && <Alert severity="warning" sx={{ mb: 2 }}>Source answer under review: {explanation.answerReviewNote}</Alert>}
    <Stack spacing={1.25}>{parseExplanation(explanation.markdown).map((block, index) => block.type === 'paragraph'
      ? <Typography key={index} sx={{ fontSize: { xs: '1rem', sm: '1.0625rem' }, lineHeight: 1.75 }}><InlineExplanationText text={block.text} /></Typography>
      : <ExplanationList key={index} block={block} />
    )}</Stack>
    {explanation.sources && <Box component="details" sx={{ mt: 2.5, borderTop: '1px solid', borderColor: 'divider', pt: 1.5, '& summary': { cursor: 'pointer', fontWeight: 700, color: 'text.secondary' } }}>
      <Box component="summary">Sources</Box>
      <Typography component="div" variant="body2" sx={{ mt: 1, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{explanation.sources}</Typography>
    </Box>}
  </Box>;
}

function FeedbackPanel({ question, selectedChoiceId }: { question: Question; selectedChoiceId?: string }) {
  const correct = isCorrect(question, selectedChoiceId);
  const explanation = explanationFor(question);
  const answerUnderReview = Boolean(explanation?.answerReviewNote);
  const statusBackground = answerUnderReview ? '#fff4dd' : correct ? '#e4f2e9' : '#fae9e6';

  const hasContent = Boolean(explanation || question.pearls?.length);
  return <Box aria-live="polite" sx={{ mt: 3, overflow: 'hidden', border: '1px solid', borderColor: answerUnderReview ? '#e9cf98' : correct ? '#b9dec6' : '#f0c6bf', borderRadius: 1, bgcolor: 'background.paper' }}>
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, bgcolor: statusBackground, borderBottom: '1px solid', borderColor: answerUnderReview ? '#f0dcaf' : correct ? '#cce6d5' : '#f3d3cd' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        {answerUnderReview ? <WarningAmberRoundedIcon color="warning" /> : correct ? <CheckCircleRoundedIcon color="success" /> : <CancelRoundedIcon color="error" />}
        <Typography fontWeight={800}>{answerUnderReview ? 'Answer key under review' : correct ? 'Correct' : 'Not quite'}</Typography>
      </Stack>
    </Box>
    {hasContent && <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 2.75 } }}>
      <ExplanationContent question={question} />
      {question.pearls?.map(pearl => <Box key={pearl} sx={{ mt: 2.5, maxWidth: '72ch', p: 1.5, borderRadius: 2, bgcolor: '#f7dfcf' }}>
        <Typography variant="subtitle2" color="primary.dark">High-yield pearl</Typography>
        <Typography sx={{ mt: .5, lineHeight: 1.65 }}>{pearl}</Typography>
      </Box>)}
    </Box>}
  </Box>;
}

type View = { page: 'dashboard' } | { page: 'subject'; subject: Subject } | { page: 'setup'; quiz: Quiz } | { page: 'quiz'; quiz: Quiz; attempt: Attempt; index: number } | { page: 'results'; quiz: Quiz; attempt: CompletedAttempt };

function ResultReviewWarning({ quiz }: { quiz: Quiz }) {
  const count = questionBank.listQuestions(quiz.id).filter(question => explanationFor(question)?.answerReviewNote).length;
  if (!count) return null;
  return <Container maxWidth="md" sx={{ pt: 4 }}><Alert severity="warning">This score uses {count} source answer {count === 1 ? 'key' : 'keys'} under review. Interpret the result with that in mind.</Alert></Container>;
}

export default function App() {
  const [view, setView] = useState<View>({ page: 'dashboard' });
  const [abortOpen, setAbortOpen] = useState(false);
  const attempts = repository.list();
  const subjectStats = useMemo(() => questionBank.listSubjects().map(subject => {
    const subjectAttempts = attempts.filter(attempt => attempt.subjectId === subject.id);
    const quizzes = questionBank.listQuizzes(subject.id);
    return { subject, quizCount: quizzes.length, attempts: subjectAttempts, best: subjectAttempts.length ? Math.max(...subjectAttempts.map(attempt => attempt.score.percentage)) : undefined };
  }), [view]);

  const leaveForDashboard = () => {
    if (view.page === 'quiz') repository.saveActive(pauseAttempt(view.attempt));
    setView({ page: 'dashboard' });
  };
  const header = <Box component="header" sx={{ py: 2.5, borderBottom: '1px solid #eee5df', bgcolor: 'rgba(255,253,251,.9)' }}><Container maxWidth="lg"><Stack direction="row" alignItems="center"><Button startIcon={<MenuBookRoundedIcon sx={{ color: 'primary.main' }} />} onClick={leaveForDashboard} sx={{ p: 0, color: 'text.primary', fontSize: 20, letterSpacing: '-.04em' }}><Box component="span" sx={{ color: 'primary.main' }}>Med</Box>ucation</Button></Stack></Container></Box>;
  const openQuiz = (quiz: Quiz) => {
    const existing = repository.getActive(quiz.id);
    if (existing) {
      const resumed = resumeAttempt(existing);
      repository.saveActive(resumed);
      setView({ page: 'quiz', quiz, attempt: resumed, index: questionIndexFor(questionBank.listQuestions(quiz.id), resumed.currentQuestionId) });
    }
    else setView({ page: 'setup', quiz });
  };
  const start = (quiz: Quiz, mode: FeedbackMode) => {
    const now = new Date().toISOString();
    const attempt: Attempt = { id: crypto.randomUUID(), quizId: quiz.id, subjectId: quiz.subjectId, feedbackMode: mode, startedAt: now, elapsedMs: 0, timerStartedAt: now, currentQuestionId: questionBank.listQuestions(quiz.id)[0]?.id, responses: {} };
    repository.saveActive(attempt);
    setView({ page: 'quiz', quiz, attempt, index: 0 });
  };

  const Dashboard = () => <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}><Stack sx={{ mb: 4 }}><Typography variant="h4">Choose a subject and start practicing</Typography></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>{[['Completed quizzes', attempts.length], ['Questions reviewed', attempts.reduce((total, attempt) => total + attempt.score.total, 0)], ['Personal best', attempts.length ? String(Math.max(...attempts.map(attempt => attempt.score.percentage))) + '%' : '—']].map(([label, value]) => <Card key={String(label)} sx={{ flex: 1 }}><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h4" sx={{ mt: .75 }}>{value}</Typography></CardContent></Card>)}</Stack><Typography variant="h5" sx={{ mb: 2 }}>Subjects</Typography><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 2 }}>{subjectStats.map(({ subject, quizCount, best }) => <Card key={subject.id} sx={{ cursor: 'pointer', '&:hover': { borderColor: subject.accent, transform: 'translateY(-2px)' }, transition: 'all .18s' }} onClick={() => setView({ page: 'subject', subject })}><CardContent><Typography variant="h6">{subject.name}</Typography><Chip label={String(quizCount) + ' quizzes'} size="small" sx={{ mt: 1.25 }} />{best !== undefined && <Typography variant="body2" sx={{ mt: 2, color: 'primary.dark', fontWeight: 700 }}>Best score {best}%</Typography>}</CardContent></Card>)}</Box></Container>;

  const SubjectPage = ({ subject }: { subject: Subject }) => {
    const quizzes = questionBank.listQuizzes(subject.id);
    return <Container maxWidth="md" sx={{ py: 5 }}><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => setView({ page: 'dashboard' })} color="inherit">All subjects</Button><Typography variant="h3" sx={{ mt: 3, mb: 4 }}>{subject.name}</Typography><Stack spacing={2}>{quizzes.map(quiz => {
      const active = repository.getActive(quiz.id);
      const current = active ? questionIndexFor(questionBank.listQuestions(quiz.id), active.currentQuestionId) + 1 : undefined;
      return <Card key={quiz.id}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}><Box><Typography variant="h6">{quiz.name}</Typography><Typography variant="body2" color="text.secondary">{quiz.status === 'ready' ? active ? 'Resume from question ' + current + ' of ' + quiz.questionCount : String(quiz.questionCount) + ' questions' : 'Content awaiting review'}</Typography></Box><Button variant="contained" disabled={quiz.status !== 'ready'} onClick={() => openQuiz(quiz)}>{quiz.status === 'ready' ? active ? 'Resume test' : 'Start quiz' : 'Not ready'}</Button></Stack></CardContent></Card>;
    })}</Stack></Container>;
  };

  const Setup = ({ quiz }: { quiz: Quiz }) => {
    const [mode, setMode] = useState<FeedbackMode>('immediate');
    return <Container maxWidth="sm" sx={{ py: 7 }}><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => setView({ page: 'subject', subject: questionBank.listSubjects().find(subject => subject.id === quiz.subjectId)! })} color="inherit">Back</Button><Typography variant="h3" sx={{ mt: 3 }}>{quiz.name}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Set your pace before you begin. The timer is a stopwatch—there is no penalty for taking time to learn.</Typography><Card sx={{ mt: 4 }}><CardContent><Typography variant="h6">Feedback mode</Typography><ToggleButtonGroup value={mode} exclusive onChange={(_, value) => value && setMode(value)} fullWidth sx={{ mt: 2 }}><ToggleButton value="immediate">Learn as you go</ToggleButton><ToggleButton value="exam">Exam mode</ToggleButton></ToggleButtonGroup><Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{mode === 'immediate' ? 'Selecting an answer locks it and shows the explanation right away.' : 'Answers remain hidden until you finish and submit the entire test.'}</Typography><Button fullWidth variant="contained" size="large" sx={{ mt: 4 }} onClick={() => start(quiz, mode)}>Begin quiz</Button></CardContent></Card></Container>;
  };

  const QuizPage = ({ quiz, attempt, index }: Extract<View, { page: 'quiz' }>) => {
    const bank = questionBank.listQuestions(quiz.id);
    const question = bank[index];
    const savedResponse = attempt.responses[question.id];
    const response = savedResponse ?? blankResponse(question.id);
    const mutate = (next: Attempt, nextIndex = index) => {
      const checkpointed = { ...next, currentQuestionId: bank[nextIndex]?.id };
      repository.saveActive(checkpointed);
      setView({ page: 'quiz', quiz, attempt: checkpointed, index: nextIndex });
    };
    useEffect(() => {
      const pauseOnPageHide = () => repository.saveActive(pauseAttempt(attempt));
      window.addEventListener('pagehide', pauseOnPageHide);
      return () => window.removeEventListener('pagehide', pauseOnPageHide);
    }, [attempt]);
    useEffect(() => {
      if (!savedResponse) return;
      const normalized = normalizeResponseForFeedbackMode(savedResponse, attempt.feedbackMode);
      if (normalized !== savedResponse) mutate(updateResponse(attempt, normalized));
    }, [attempt, question.id]);
    const select = (choice: string) => !response.locked && mutate(updateResponse(attempt, selectChoice(response, choice, attempt.feedbackMode)));
    const finish = () => {
      const paused = pauseAttempt(attempt);
      const score = scoreAttempt(paused, bank);
      const complete: CompletedAttempt = { ...paused, completedAt: new Date().toISOString(), score };
      repository.saveCompleted(complete);
      repository.clearActive(quiz.id);
      setView({ page: 'results', quiz, attempt: complete });
    };
    const abort = () => {
      repository.clearActive(quiz.id);
      setAbortOpen(false);
      setView({ page: 'subject', subject: questionBank.listSubjects().find(subject => subject.id === quiz.subjectId)! });
    };
    const leave = () => {
      repository.saveActive(pauseAttempt({ ...attempt, currentQuestionId: question.id }));
      setView({ page: 'subject', subject: questionBank.listSubjects().find(subject => subject.id === quiz.subjectId)! });
    };
    const feedback = response.locked && attempt.feedbackMode === 'immediate';
    const answerUnderReview = Boolean(explanationFor(question)?.answerReviewNote);

    return <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2" color="text.secondary">Question {index + 1} of {bank.length}</Typography><Stopwatch attempt={attempt} /></Stack><LinearProgress variant="determinate" value={(index + 1) / bank.length * 100} sx={{ mt: 1.5, height: 7, borderRadius: 5 }} /><Card sx={{ mt: 3 }}><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}><Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="h5" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{question.stem}</Typography><IconButton aria-label="Flag question" onClick={() => mutate(updateResponse(attempt, { ...response, flagged: !response.flagged }))}>{response.flagged ? <FlagIcon color="primary" /> : <FlagOutlinedIcon />}</IconButton></Stack><RadioGroup value={response.selectedChoiceId ?? ''} onChange={(_, choice) => select(choice)} sx={{ mt: 3, gap: 1.25 }}>{question.choices.map(choice => {
      const selected = response.selectedChoiceId === choice.id;
      const correct = isCorrect(question, choice.id);
      const state = feedback && !answerUnderReview ? correct ? '#e4f2e9' : selected ? '#fae9e6' : undefined : undefined;
      return <Box key={choice.id} sx={{ border: '1px solid', borderColor: selected ? 'primary.main' : '#e8dfd9', bgcolor: state, borderRadius: 1, p: .5 }}><FormControlLabel disabled={response.locked} value={choice.id} control={<Radio />} label={<Typography sx={{ py: .8 }}><b>{choice.id}.</b> {choice.text}</Typography>} sx={{ m: 0, width: '100%' }} /></Box>;
    })}</RadioGroup>{feedback && <FeedbackPanel question={question} selectedChoiceId={response.selectedChoiceId} />}</CardContent></Card><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 3 }}><Stack direction="row" spacing={1}><Button onClick={leave}>Leave test</Button><Button color="error" onClick={() => setAbortOpen(true)}>Abort test</Button></Stack><Stack direction="row" spacing={1}><Button disabled={index === 0} onClick={() => mutate(attempt, index - 1)}>Previous</Button>{index === bank.length - 1 ? <Button variant="contained" onClick={finish}>{attempt.feedbackMode === 'exam' ? 'Submit test' : 'Finish'}</Button> : <Button onClick={() => mutate(attempt, index + 1)}>{feedback ? 'Continue' : 'Next'}</Button>}</Stack></Stack><Dialog open={abortOpen} onClose={() => setAbortOpen(false)}><DialogTitle>Abort this test?</DialogTitle><DialogContent><DialogContentText>Your current answers and progress will be discarded. You’ll return to this subject’s quiz list, where you can begin a new attempt.</DialogContentText></DialogContent><DialogActions><Button onClick={() => setAbortOpen(false)}>Keep testing</Button><Button color="error" variant="contained" onClick={abort}>Abort test</Button></DialogActions></Dialog></Container>;
  };

  const Results = ({ quiz, attempt }: Extract<View, { page: 'results' }>) => {
    const score = attempt.score;
    const rows = performanceBy(questions, [attempt], 'topic');
    return <Container maxWidth="md" sx={{ py: 7 }}><Stack alignItems="center" textAlign="center"><CheckCircleRoundedIcon color="success" sx={{ fontSize: 50 }} /><Typography variant="overline" color="primary.main" fontWeight={800} sx={{ mt: 1 }}>Quiz complete</Typography><Typography variant="h2">{score.percentage}%</Typography><Typography color="text.secondary">{score.correct} correct · {score.incorrect} incorrect · {score.unanswered} unanswered</Typography></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 5 }}>{[['Total time', duration(score.elapsedMs)], ['Average / question', duration(score.total ? score.elapsedMs / score.total : 0)], ['Score', String(score.correct) + ' / ' + score.total]].map(([label, value]) => <Card key={label} sx={{ flex: 1 }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>)}</Stack>{rows.length > 0 && <Card sx={{ mt: 3 }}><CardContent><Typography variant="h6">Performance by topic</Typography>{rows.map(row => <Box key={row.label} sx={{ mt: 2 }}><Stack direction="row" justifyContent="space-between"><Typography>{row.label}</Typography><Typography fontWeight={700}>{row.correct}/{row.total} · {row.percentage}%</Typography></Stack><LinearProgress variant="determinate" value={row.percentage} sx={{ mt: .75 }} /></Box>)}</CardContent></Card>}<Button variant="contained" sx={{ mt: 4 }} onClick={() => setView({ page: 'subject', subject: questionBank.listSubjects().find(subject => subject.id === quiz.subjectId)! })}>Back to quizzes</Button></Container>;
  };

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>{header}{view.page === 'dashboard' && <Dashboard />}{view.page === 'subject' && <SubjectPage subject={view.subject} />}{view.page === 'setup' && <Setup quiz={view.quiz} />}{view.page === 'quiz' && <QuizPage {...view} />}{view.page === 'results' && <><ResultReviewWarning quiz={view.quiz} /><Results {...view} /></>}</Box>;
}
