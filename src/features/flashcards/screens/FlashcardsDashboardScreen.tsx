import { Box } from '@mui/material';
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import type { Subject } from '../../../domain/types';
import type { FlashcardDashboardSubject } from '../selectors/flashcards';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { StudyDashboardLayout } from '../../../shared/ui/catalog/StudyDashboardLayout';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { ContinueStudyCard, completedPercent, completionProgress } from '../../../shared/ui/catalog/ContinueStudyCard';
import { StudyCardIllustration } from '../../../shared/ui/catalog/StudyCardIllustration';
import { SubjectCard } from '../../../shared/ui/catalog/SubjectCard';
import { SubjectCatalogPage, SubjectGrid } from '../../../shared/ui/catalog/SubjectGrid';
import { StatCard, formatStatCount } from '../../../shared/ui/catalog/StatCard';
import { StatCardRow } from '../../../shared/ui/catalog/StatCardRow';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { useFlashcardDashboardStats } from '../session/useFlashcardDashboardStats';
import { SubjectProgressLabel, SubjectProgressSummary } from '../../../shared/ui/catalog/SubjectProgressSummary';
import { SubjectCardSkeleton } from '../../../shared/ui/catalog/SubjectCardSkeleton';
import { SubjectFilterPill, SubjectPagination } from '../../../shared/ui/catalog/SubjectCatalogControls';
import { useSubjectCatalog } from '../../../shared/ui/catalog/useSubjectCatalog';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';

function FlashcardSubjectCard({
  item,
  progressUnavailable,
  onSelect,
}: {
  item: FlashcardDashboardSubject;
  progressUnavailable: boolean;
  onSelect: (subject: Subject) => void;
}) {
  const percent = completedPercent(progressUnavailable ? 0 : item.completedDeckCount, item.deckCount);
  return (
    <SubjectCard subject={item.subject} onSelect={onSelect} appearance="dashboardGrid">
      <SubjectProgressSummary
        label={percent > 0 && <SubjectProgressLabel>Completed {percent}%</SubjectProgressLabel>}
        percent={percent}
        activeCount={item.activeDeckCount}
      />
    </SubjectCard>
  );
}

function SubjectPlaceholders() {
  return (
    <SubjectGrid>
      {Array.from({ length: 6 }, (_, index) => (
        <SubjectCardSkeleton key={index} />
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
  onContinueSubject = onSelectSubject,
}: {
  subjects: FlashcardDashboardSubject[];
  activeSubjects: FlashcardDashboardSubject[];
  progress: FlashcardProgressState;
  progressError?: string;
  loading?: boolean;
  error?: Error;
  onRetry: () => void | Promise<void>;
  onSelectSubject: (subject: Subject) => void;
  onContinueSubject?: (subject: Subject) => void;
}) {
  const stats = useFlashcardDashboardStats(progress);
  const metric = (value: number) => (progressError ? '—' : formatStatCount(value));
  const catalog = useSubjectCatalog(
    'flashcards',
    subjects,
    (item) => item.activeDeckCount > 0,
    (item) => item.subject.id,
  );
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
        subjectsActions={
          <SubjectFilterPill
            value={catalog.filter}
            onChange={catalog.setFilter}
            disabled={loading || Boolean(error || progressError)}
            allButtonRef={catalog.filterButtonRef}
          />
        }
        summary={
          <StatCardRow>
            <StatCard
              label="Completed"
              icon={<StyleOutlinedIcon aria-hidden="true" focusable="false" />}
              value={metric(stats.completedDecks)}
              supportingText="decks"
            />
            <StatCard
              label="Average"
              accessibleLabel="Average flashcard deck finishes per day"
              icon={<BarChartOutlinedIcon aria-hidden="true" focusable="false" />}
              value={metric(stats.averagePerDay)}
              supportingText="decks / day"
            />
            <StatCard
              label="Highest"
              accessibleLabel="Highest flashcard deck finishes in a day"
              icon={<EmojiEventsOutlinedIcon aria-hidden="true" focusable="false" />}
              value={metric(stats.highestInDay)}
              supportingText="decks finished in a day"
            />
          </StatCardRow>
        }
        continueStudying={
          !loading && !error && activeSubjects.length > 0 ? (
            <StudyItemCarousel
              items={activeSubjects}
              id="continue-studying-flashcards"
              title="Continue Studying"
              itemLabel="active subject"
              itemKey={(item) => item.subject.id}
              renderItem={(item) => (
                <ContinueStudyCard
                  title={item.subject.name}
                  activityLabel={`${item.activeDeckCount} ${item.activeDeckCount === 1 ? 'deck' : 'decks'} in progress`}
                  accessibleLabel={`Continue studying ${item.subject.name}`}
                  onContinue={() => onContinueSubject(item.subject)}
                  progress={
                    progressError ? undefined : completionProgress(item.completedDeckCount, item.deckCount, 'deck')
                  }
                  illustration={<StudyCardIllustration subjectId={item.subject.id} />}
                />
              )}
            />
          ) : null
        }
      >
        {loading || error ? (
          <SubjectPlaceholders />
        ) : subjects.length === 0 ? (
          <SubjectCatalogEmptyState title="No subjects are available yet." />
        ) : progressError && catalog.filter === 'inProgress' ? (
          <Box role="status" aria-live="polite" sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
            In-progress subjects are unavailable right now.
          </Box>
        ) : catalog.total === 0 ? (
          <SubjectCatalogEmptyState title="No subjects in progress" onShowAll={catalog.showAll} />
        ) : (
          <>
            <SubjectCatalogPage
              catalog={catalog}
              itemKey={(item) => item.subject.id}
              renderItem={(item) => (
                <FlashcardSubjectCard
                  item={item}
                  progressUnavailable={Boolean(progressError)}
                  onSelect={onSelectSubject}
                />
              )}
            />
            <SubjectPagination page={catalog.page} pageCount={catalog.pageCount} onChange={catalog.changePage} />
          </>
        )}
      </StudyDashboardLayout>
    </>
  );
}
