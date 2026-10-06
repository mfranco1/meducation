import { Box, Chip, Stack, Typography } from '@mui/material';
import type { Subject } from '../../domain/types';
import type { FlashcardDashboardSubject } from '../flashcards';
import { ContentRecoveryBanner } from '../components/ContentRecoveryBanner';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { StudyDashboardLayout } from '../components/StudyDashboardLayout';
import { StudyItemCarousel } from '../components/StudyItemCarousel';
import { SubjectCard } from '../components/SubjectCard';
import { SubjectGrid } from '../components/SubjectGrid';

function SubjectPlaceholders() {
  return (
    <SubjectGrid>
      {Array.from({ length: 6 }, (_, index) => (
        <LoadingSkeleton key={index} variant="rounded" height={112} />
      ))}
    </SubjectGrid>
  );
}

export function FlashcardsDashboardScreen({
  subjects,
  activeSubjects,
  loading = false,
  error,
  onRetry,
  onSelectSubject,
}: {
  subjects: FlashcardDashboardSubject[];
  activeSubjects: FlashcardDashboardSubject[];
  loading?: boolean;
  error?: Error;
  onRetry: () => void | Promise<void>;
  onSelectSubject: (subject: Subject) => void;
}) {
  return (
    <>
      {error && (
        <ContentRecoveryBanner
          title="We can’t load flashcard subjects right now."
          description="Your saved deck position is safe. Please try again."
          error={error}
          onRetry={onRetry}
        />
      )}
      <StudyDashboardLayout
        continueStudying={
          !loading && !error ? (
            <StudyItemCarousel
              items={activeSubjects}
              id="continue-studying-flashcards"
              title="Continue Studying"
              itemLabel="active subject"
              itemKey={(item) => item.subject.id}
              renderItem={(item) => (
                <SubjectCard subject={item.subject} onSelect={onSelectSubject}>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                    <Chip
                      label={`${item.activeDeckCount} in progress`}
                      size="small"
                      sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}
                    />
                  </Stack>
                </SubjectCard>
              )}
            />
          ) : null
        }
      >
        {loading || error ? (
          <SubjectPlaceholders />
        ) : subjects.length === 0 ? (
          <Typography color="text.secondary">No subjects are available yet.</Typography>
        ) : (
          <SubjectGrid>
            {subjects.map((item) => (
              <SubjectCard key={item.subject.id} subject={item.subject} onSelect={onSelectSubject}>
                {item.activeDeckCount > 0 && (
                  <Box sx={{ mt: 1.25 }}>
                    <Chip
                      label={`${item.activeDeckCount} in progress`}
                      size="small"
                      sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}
                    />
                  </Box>
                )}
              </SubjectCard>
            ))}
          </SubjectGrid>
        )}
      </StudyDashboardLayout>
    </>
  );
}
