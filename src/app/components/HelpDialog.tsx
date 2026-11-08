import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

const faqs = [
  [
    'Where is my progress saved?',
    'Your quiz and flashcard progress stays in this browser. There is no learner account or automatic sync between devices. Clearing browser data deletes your progress. Download a backup before clearing it or switching browsers.',
  ],
  [
    'How do I back up or move my progress?',
    'Open Progress in the navigation to download a backup. Keep the file somewhere safe. To move your progress, open Progress in the other browser and restore that file. Restoring replaces the progress already saved there. Save and leave your study session before opening Progress.',
  ],
  [
    'What is the difference between quiz modes?',
    'Fast Feedback shows the correct answer and explanation as soon as you answer. Your answer is then locked. Exam Mode lets you change answers and shows feedback after you submit.',
  ],
  [
    'How do I resume studying?',
    'Use Continue Studying on the Quizzes or Flashcards dashboard to return to an unfinished quiz or deck. Save and leave your study session to keep your place.',
  ],
  [
    'How do I review a past quiz?',
    'Open the subject and choose Review on the quiz, then pick an attempt. This browser keeps your 250 most recent attempts.',
  ],
  [
    'Why can’t I resume after a content update?',
    'If questions, answers or cards have changed, the app may ask you to restart the quiz or deck. Your saved session stays unchanged unless you confirm the restart.',
  ],
  [
    'How do I report a content mistake?',
    'Message us on Telegram. Include the quiz or deck name, the question or card text, and what seems incorrect. A screenshot helps. Question numbers and answer letters alone may not identify the item because quizzes shuffle questions and choices.',
  ],
] as const;

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="help-title"
      scroll="paper"
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
    >
      <DialogTitle id="help-title">Help</DialogTitle>
      <DialogContent dividers>
        <Box component="section" sx={{ mb: 3 }}>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            Contact support
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Message us on Telegram for help or to report a problem.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            For an app problem, include what happened, your browser and device, and a screenshot if possible.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Telegram:{' '}
            <Link href="https://t.me/MeducationSupport" target="_blank" rel="noopener noreferrer">
              @MeducationSupport
            </Link>
          </Typography>
          <Button
            component="a"
            href="https://t.me/MeducationSupport"
            target="_blank"
            rel="noopener noreferrer"
            variant="contained"
          >
            Open Telegram
          </Button>
        </Box>
        <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
          Frequently asked questions
        </Typography>
        {faqs.map(([question, answer], index) => (
          <Accordion key={question} disableGutters elevation={0}>
            <AccordionSummary
              expandIcon={<ExpandMoreRoundedIcon />}
              id={`help-faq-${index}`}
              aria-controls={`help-answer-${index}`}
            >
              <Typography variant="subtitle2">{question}</Typography>
            </AccordionSummary>
            <AccordionDetails id={`help-answer-${index}`}>
              <Typography variant="body2">{answer}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
