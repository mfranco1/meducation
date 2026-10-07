import { Box, Chip, Stack, Typography } from '@mui/material';
import type { Subject } from '../../../domain/types';
import type { FlashcardDashboardSubject } from '../selectors/flashcards';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';
import { StudyDashboardLayout } from '../../../shared/ui/catalog/StudyDashboardLayout';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { SubjectCard } from '../../../shared/ui/catalog/SubjectCard';
import { SubjectGrid } from '../../../shared/ui/catalog/SubjectGrid';
import { StatCard } from '../../../shared/ui/catalog/StatCard';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { useFlashcardDashboardStats } from '../session/useFlashcardDashboardStats';

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
  progress,
  progressError,
  loading = false,
  error,
  onRetry,
  onSelectSubject,
}: {
  subjects: FlashcardDashboardSubject[];
  activeSubjects: FlashcardDashboardSubject[];
  progress: FlashcardProgressState;
  progressError?: string;
  loading?: boolean;
  error?: Error;
  onRetry: () => void | Promise<void>;
  onSelectSubject: (subject: Subject) => void;
}) {
  const stats = useFlashcardDashboardStats(progress);
  const metric = (value: string | number) => progressError ? '—' : value;
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
        summary={<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
          <StatCard label="Completed decks" value={metric(stats.completedDecks)} footer={<Typography color="text.secondary" variant="caption">All recorded finishes</Typography>} />
          <StatCard label="Average" value={metric(stats.averagePerDay.toFixed(1))} footer={<Typography color="text.secondary" variant="caption">decks/day · since tracking began</Typography>} />
          <StatCard label="Highest" value={metric(stats.highestInDay)} footer={<Typography color="text.secondary" variant="caption">decks in one local day</Typography>} />
        </Stack>}
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
