import { keyframes } from '@emotion/react';
import { useEffect, useRef, useState } from 'react';
import { Box, Card, CardContent, FormControlLabel, Radio, RadioGroup, Stack, Typography, useTheme } from '@mui/material';
import { MarkdownContent } from '../../../../shared/ui/content/MarkdownContent';
import { isCorrect } from '../../../../domain/quizEngine';
import type { Question, QuestionResponse } from '../../../../domain/types';
import { RadiatingCircles } from '../celebration/RadiatingCircles';
import { FeedbackPanel } from '../feedback/FeedbackPanel';
import { StudyFlagButton } from '../../../../shared/ui/study/StudyFlagButton';
import { canHandleStudyShortcut } from '../../../../shared/ui/study/studyKeyboard';
import { easing, reducedMotion } from '../../../../shared/ui/motion';

interface CorrectAnswerBurst { choiceId: string; eventId: number }

const feedbackRise = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;

const choicePress = keyframes`
  from { transform: scale(.985); }
  to { transform: none; }
`;

/** Render with key={question.id} so press and burst state reset when the question changes. */
export function QuestionCard({ question, response, showFeedback, burstOnCorrect, keyboardShortcuts, shortcutsDisabled, onSelect, onToggleFlag }: {
  question: Question;
  response: QuestionResponse;
  showFeedback: boolean;
  burstOnCorrect: boolean;
  keyboardShortcuts?: boolean;
  shortcutsDisabled?: boolean;
  onSelect: (choiceId: string) => void;
  onToggleFlag?: () => void;
}) {
  const theme = useTheme();
  const burstSequence = useRef(0);
  const [correctAnswerBurst, setCorrectAnswerBurst] = useState<CorrectAnswerBurst>();
  const [pressedChoice, setPressedChoice] = useState<string>();
  const select = (choiceId: string) => {
    if (response.locked) return;
    setPressedChoice(choiceId);
    if (burstOnCorrect && isCorrect(question, choiceId)) setCorrectAnswerBurst({ choiceId, eventId: ++burstSequence.current });
    onSelect(choiceId);
  };

  useEffect(() => {
    if (!keyboardShortcuts || shortcutsDisabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const choiceIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : /^[a-i]$/.test(key) ? key.charCodeAt(0) - 97 : -1;
      const choice = question.choices[choiceIndex];
      if (!choice || event.repeat || !canHandleStudyShortcut(event, 'choice')) return;
      event.preventDefault();
      select(choice.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    if (!correctAnswerBurst) return;
    const timer = window.setTimeout(() => setCorrectAnswerBurst(undefined), 950);
    return () => window.clearTimeout(timer);
  }, [correctAnswerBurst]);

  return <Card><CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
      <Box sx={{ flex: 1, minWidth: 0 }}><MarkdownContent markdown={question.stem} variant="stem" contentKind="rich" /></Box>
      {onToggleFlag && <StudyFlagButton size="small" flagged={response.flagged} label={response.flagged ? 'Remove question flag' : 'Flag question'} onToggle={onToggleFlag} sx={{ p: 0, mt: .5, flexShrink: 0 }} />}
    </Stack>
    <RadioGroup value={response.selectedChoiceId ?? ''} onChange={(_, choice) => select(choice)} sx={{ mt: 3, gap: 1.25 }}>
      {question.choices.map((choice, position) => {
        const selected = response.selectedChoiceId === choice.id;
        const correct = isCorrect(question, choice.id);
        const state = showFeedback ? correct ? theme.palette.feedback.correct.surface : selected ? theme.palette.feedback.incorrect.surface : undefined : undefined;
        const showCorrectAnswerBurst = correctAnswerBurst?.choiceId === choice.id;
        const pressed = selected && pressedChoice === choice.id;
        return <Box key={choice.id} sx={{ position: 'relative', zIndex: showCorrectAnswerBurst ? 1 : undefined, isolation: 'isolate', overflow: 'visible', border: '1px solid', borderColor: selected ? 'primary.main' : theme.palette.feedback.choiceBorder, bgcolor: state, borderRadius: 1, p: .5, transition: 'transform 120ms ease-out, border-color 160ms ease-out, background-color 160ms ease-out', animation: pressed ? `${choicePress} 220ms ease-out` : undefined, '&:active': response.locked ? undefined : { transform: 'scale(.985)' }, [reducedMotion]: { transition: 'none', animation: 'none', '&:active': { transform: 'none' } } }}>
          {showCorrectAnswerBurst && <RadiatingCircles key={correctAnswerBurst.eventId} direction="both" particleCount={16} durationMs={900} horizontalSpread={16} verticalSpread={18} particleSize={7} />}
          <FormControlLabel disabled={response.locked} value={choice.id} control={<Radio sx={{ '& .MuiSvgIcon-root': { transition: 'color 160ms ease-out' }, '& .MuiSvgIcon-root + .MuiSvgIcon-root': { transition: 'transform 240ms cubic-bezier(.34, 1.56, .64, 1)' }, [reducedMotion]: { '& .MuiSvgIcon-root, & .MuiSvgIcon-root + .MuiSvgIcon-root': { transition: 'none' } }, ...(showFeedback && correct && { color: 'success.main', '&.Mui-checked, &.Mui-disabled': { color: 'success.main' } }) }} />} label={<Typography component="div" sx={{ py: .8 }}><b>{String.fromCharCode(65 + position)}.</b> <MarkdownContent markdown={choice.text} variant="inline" /></Typography>} sx={{ m: 0, width: '100%', position: 'relative', zIndex: 1 }} />
        </Box>;
      })}
    </RadioGroup>
    {showFeedback && <Box sx={pressedChoice === response.selectedChoiceId ? { animation: `${feedbackRise} 200ms ${easing.out}`, [reducedMotion]: { animation: 'none' } } : undefined}><FeedbackPanel question={question} selectedChoiceId={response.selectedChoiceId} /></Box>}
  </CardContent></Card>;
}
