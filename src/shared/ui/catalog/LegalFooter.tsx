import { useState, type ReactNode } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Link, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { brand } from '../../brand';

const contactUrl = 'https://t.me/MeducationSupport';
const lastUpdated = 'October 29, 2026';

const Contact = () => <><Link href={contactUrl} target="_blank" rel="noopener noreferrer">@MeducationSupport</Link> on Telegram</>;
const P = ({ children }: { children: ReactNode }) => <Typography variant="body2" sx={{ '& + &': { mt: 1 } }}>{children}</Typography>;
const List = ({ items }: { items: ReactNode[] }) => (
  <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, typography: 'body2', '& li + li': { mt: 0.5 } }}>
    {items.map((item, index) => <li key={index}>{item}</li>)}
  </Box>
);

type LegalDocument = 'Privacy' | 'Terms';

const documents: Record<LegalDocument, { title: string; intro: ReactNode; sections: [string, ReactNode][] }> = {
  Privacy: {
    title: 'Privacy Notice',
    intro: `${brand.name} is a free study app. This notice explains what we collect when you use it and how we use it.`,
    sections: [
      ['Information we collect', <>
        <P>We don’t collect information that identifies you.</P>
        <List items={['No accounts or sign-in', 'No cookies', 'No analytics, tracking or ads']} />
      </>],
      ['Your study progress', <>
        <P>Your quiz and flashcard progress is saved only in this browser. It is never sent to us, and we can’t see it.</P>
        <P>Clearing your browser data deletes your progress. Backup files you export stay on your device.</P>
      </>],
      ['Server logs', <>
        <P>Our hosting provider processes network requests to deliver the app and may log technical data such as your IP address.</P>
        <P>Our own logs record only failed requests, without page addresses or search terms. Logs are kept for up to 14 days and used only to find and fix problems.</P>
      </>],
      ['Your rights', <P>Under the Data Privacy Act of 2012 (Republic Act No. 10173), you can ask what personal data we hold about you and ask us to correct or delete it. Send requests to <Contact />.</P>],
      ['Changes to this notice', <P>We update this notice when the app changes. The date at the top shows the latest version.</P>],
      ['Contact', <P>Send questions about this notice to <Contact />.</P>],
    ],
  },
  Terms: {
    title: 'Terms of Use',
    intro: `By using ${brand.name}, you agree to these terms.`,
    sections: [
      ['Educational use only', <P>{brand.name} is a study aid. It is not medical advice and does not replace clinical judgment, current guidelines or official review materials. Do not use it to make decisions about patient care.</P>],
      ['Accuracy', <P>We review content carefully, but it may contain errors or become out of date. If you find a mistake, report it to <Contact />.</P>],
      ['No affiliation', <P>{brand.name} is not affiliated with or endorsed by any licensing board, school or publisher.</P>],
      ['Content and permitted use', <>
        <P>Questions, explanations and flashcards are written or adapted by the {brand.name} team. Some are based on published textbooks and clinical practice guidelines and are paraphrased, not copied.</P>
        <List items={['You may use the content for your own study.', 'You may not copy, republish or sell it.']} />
        <Typography variant="body2" sx={{ mt: 1 }}>Rights holders with concerns can contact <Contact />.</Typography>
      </>],
      ['Availability', <P>The app is provided as is, without warranties. We may change or remove content or features at any time.</P>],
      ['Governing law', <P>These terms are governed by the laws of the Philippines.</P>],
      ['Contact', <P>Send questions about these terms to <Contact />.</P>],
    ],
  },
};

const linkSx = { minWidth: 0, p: 0, font: 'inherit', color: 'inherit', textDecoration: 'none', '&:hover': { color: 'text.primary', background: 'none' } };

export function LegalFooter() {
  const [open, setOpen] = useState<LegalDocument>();
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const document = open && documents[open];
  const close = () => setOpen(undefined);
  return (
    <Box component="footer" sx={{ mt: 4, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 1 }}
      >
        <span>© {new Date().getFullYear()} {brand.name}</span>
        <span aria-hidden="true">·</span>
        <Button variant="text" disableRipple sx={linkSx} onClick={() => setOpen('Privacy')}>Privacy</Button>
        <span aria-hidden="true">·</span>
        <Button variant="text" disableRipple sx={linkSx} onClick={() => setOpen('Terms')}>Terms</Button>
        <span aria-hidden="true">·</span>
        <Link href={contactUrl} target="_blank" rel="noopener noreferrer" sx={linkSx}>Contact</Link>
      </Typography>
      <Dialog open={Boolean(document)} onClose={close} scroll="paper" maxWidth="sm" fullWidth fullScreen={fullScreen}>
        {document && (
          <>
            <DialogTitle sx={{ pr: 7 }}>
              <Box component="span" sx={{ display: 'block', fontWeight: 800 }}>{document.title}</Box>
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Last updated {lastUpdated}
              </Typography>
              <IconButton aria-label="Close" onClick={close} sx={{ position: 'absolute', top: 12, right: 12 }}>
                <CloseRoundedIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ py: 3 }}>
              <Typography variant="body1" sx={{ mb: 3 }}>{document.intro}</Typography>
              {document.sections.map(([heading, body], index) => (
                <Box component="section" key={heading} sx={{ '& + &': { mt: 3 } }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 0.75 }}>
                    {index + 1}. {heading}
                  </Typography>
                  {body}
                </Box>
              ))}
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}
