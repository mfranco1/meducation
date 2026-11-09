import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Box, Stack, Typography, useTheme } from '@mui/material';
import { useMemo } from 'react';
import { MarkdownContent } from '../../../../shared/ui/content/MarkdownContent';
import { isCorrect } from '../../../../domain/quizEngine';
import type { Question } from '../../../../domain/types';

export type ReadOnlyFeedbackStatus = 'correct' | 'incorrect' | 'unanswered' | 'unavailable';

function ExplanationContent({ question }: { question: Question }) {
  return (
    <Box sx={{ maxWidth: '72ch' }}>
      <Typography
        variant="subtitle2"
        sx={{ mb: 1, color: 'text.secondary', letterSpacing: '.02em', textTransform: 'uppercase' }}
      >
        Explanation
      </Typography>
      <MarkdownContent markdown={question.rationale} contentKind="rich" />
    </Box>
  );
}

export function FeedbackPanel({
  question,
  selectedChoiceId,
  readOnlyStatus,
}: {
  question: Question;
  selectedChoiceId?: string;
  readOnlyStatus?: ReadOnlyFeedbackStatus;
}) {
  const theme = useTheme();
  const correct = isCorrect(question, selectedChoiceId);
  const status = readOnlyStatus ?? (correct ? 'correct' : 'incorrect');
  const tone =
    status === 'unanswered' || status === 'unavailable'
      ? theme.palette.feedback.review
      : status === 'correct'
        ? theme.palette.feedback.correct
        : theme.palette.feedback.incorrect;
  const iconColor =
    status === 'unanswered' || status === 'unavailable'
      ? 'warning.main'
      : status === 'correct'
        ? 'success.main'
        : 'error.main';
  const { pearls } = question;
  const pearl = useMemo(
    () => (pearls?.length ? pearls[Math.floor(Math.random() * pearls.length)] : undefined),
    [pearls],
  );
  const sources = question.rationaleMeta?.sources;
  const hasContent = readOnlyStatus !== undefined || Boolean(question.rationale || pearl);
  const title =
    readOnlyStatus === undefined
      ? correct
        ? 'Correct'
        : 'Not quite'
      : { correct: 'Correct', incorrect: 'Incorrect', unanswered: 'Unanswered', unavailable: 'Answer unavailable' }[
          status
        ];
  return (
    <Box
      aria-live="polite"
      sx={{
        mt: 3,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: tone.border,
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          bgcolor: tone.surface,
          borderBottom: '1px solid',
          borderColor: tone.separator,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {status === 'unanswered' || status === 'unavailable' ? (
            <WarningAmberRoundedIcon color="warning" />
          ) : status === 'correct' ? (
            <CheckCircleRoundedIcon color="success" />
          ) : (
            <CancelRoundedIcon color="error" />
          )}
          <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        </Stack>
      </Box>
      {hasContent && (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 2.75 } }}>
          {readOnlyStatus !== undefined && !question.rationale && !sources ? (
            <Typography sx={{ color: 'text.secondary' }}>Explanation unavailable.</Typography>
          ) : (
            <ExplanationContent question={question} />
          )}
          {pearl && (
            <Box sx={{ mt: 2.5, maxWidth: '72ch', py: 0.5, pl: 2, borderLeft: '3px solid', borderColor: tone.border }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <LightbulbOutlinedIcon fontSize="small" sx={{ color: iconColor }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Pearl
                </Typography>
              </Stack>
              <Typography sx={{ mt: 1, lineHeight: 1.65 }}>{pearl}</Typography>
            </Box>
          )}
          {sources && (
            <Box
              component="details"
              sx={{
                mt: 2.5,
                maxWidth: '72ch',
                borderTop: '1px solid',
                borderColor: 'divider',
                pt: 1.5,
                '& summary': { cursor: 'pointer', fontWeight: 700, color: 'text.secondary' },
              }}
            >
              <Box component="summary">Sources</Box>
              <Box sx={{ mt: 1, '& p': { fontSize: '.875rem' } }}>
                <MarkdownContent markdown={sources} />
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
