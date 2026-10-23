import { Box } from '@mui/material';
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../../../domain/types';
import type { FlashcardDashboardSubject } from '../selectors/flashcards';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { StudyDashboardLayout } from '../../../shared/ui/catalog/StudyDashboardLayout';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { ContinueStudyCard } from '../../../shared/ui/catalog/ContinueStudyCard';
import { StudyCardIllustration } from '../../../shared/ui/catalog/StudyCardIllustration';
import { SubjectCard } from '../../../shared/ui/catalog/SubjectCard';
import { SubjectGrid } from '../../../shared/ui/catalog/SubjectGrid';
import { StatCard, formatStatCount } from '../../../shared/ui/catalog/StatCard';
import { StatCardRow } from '../../../shared/ui/catalog/StatCardRow';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { useFlashcardDashboardStats } from '../session/useFlashcardDashboardStats';
import { SubjectProgressLabel, SubjectProgressSummary } from '../../../shared/ui/catalog/SubjectProgressSummary';
import { SubjectCardSkeleton } from '../../../shared/ui/catalog/SubjectCardSkeleton';
import { SubjectFilterPill, SubjectPagination } from '../../../shared/ui/catalog/SubjectCatalogControls';
import { useSubjectCatalog } from '../../../shared/ui/catalog/useSubjectCatalog';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';
import { CatalogPageTransition } from '../../../shared/ui/catalog/CatalogPageTransition';

type CatalogPageChange = {
  id: number;
  from: FlashcardDashboardSubject[];
  resetKey: string;
  direction: 'next' | 'previous';
};

function FlashcardSubjectCard({
  item,
  progressUnavailable,
  onSelect,
}: {
  item: FlashcardDashboardSubject;
  progressUnavailable: boolean;
  onSelect: (subject: Subject) => void;
}) {
  const completed = progressUnavailable ? 0 : item.completedDeckCount;
  // Any completed deck shows at least 1% so real progress never reads as zero.
  const percent = completed > 0 ? Math.max(1, Math.round((completed / item.deckCount) * 100)) : 0;
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
  const metric = (value: number) => (progressError ? '—' : formatStatCount(value));
  const catalog = useSubjectCatalog('flashcards', subjects, (item) => item.activeDeckCount > 0);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const focusAllFilter = useRef(false);
  const [pageChange, setPageChange] = useState<CatalogPageChange | null>(null);
  const resetKey = `${catalog.filter}:${subjects.map(({ subject }) => subject.id).join(',')}`;
  const changePage = (page: number) => {
    if (page === catalog.page) return;
    setPageChange({
      id: (pageChange?.id ?? 0) + 1,
      from: [...catalog.pageItems],
      resetKey,
      direction: page > catalog.page ? 'next' : 'previous',
    });
    catalog.setPage(page);
  };
  useEffect(() => {
    if (focusAllFilter.current && catalog.filter === 'all') {
      filterButtonRef.current?.focus();
      focusAllFilter.current = false;
    }
  }, [catalog.filter]);
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
            allButtonRef={filterButtonRef}
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
          !loading && !error ? (
            <StudyItemCarousel
              items={activeSubjects}
              id="continue-studying-flashcards"
              title="Continue Studying"
              itemLabel="active subject"
              itemKey={(item) => item.subject.id}
              layout="continueStudy"
              headingVisibility="srOnly"
              renderItem={(item) => (
                <ContinueStudyCard
                  title={item.subject.name}
                  activityLabel={`${item.activeDeckCount} ${item.activeDeckCount === 1 ? 'deck' : 'decks'} in progress`}
                  accessibleLabel={`Continue studying ${item.subject.name}`}
                  onContinue={() => onSelectSubject(item.subject)}
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
          <SubjectCatalogEmptyState
            title="No subjects in progress"
            onShowAll={
              subjects.length > 0
                ? () => {
                    focusAllFilter.current = true;
                    catalog.setFilter('all');
                  }
                : undefined
            }
          />
        ) : (
          <>
            <CatalogPageTransition
              requestId={pageChange?.id ?? 0}
              resetKey={resetKey}
              direction={pageChange?.direction ?? 'next'}
              previousPage={
                pageChange?.resetKey === resetKey ? (
                  <SubjectGrid>
                    {pageChange.from.map((item) => (
                      <FlashcardSubjectCard
                        key={item.subject.id}
                        item={item}
                        progressUnavailable={Boolean(progressError)}
                        onSelect={onSelectSubject}
                      />
                    ))}
                  </SubjectGrid>
                ) : undefined
              }
            >
              <SubjectGrid>
                {catalog.pageItems.map((item) => (
                  <FlashcardSubjectCard
                    key={item.subject.id}
                    item={item}
                    progressUnavailable={Boolean(progressError)}
                    onSelect={onSelectSubject}
                  />
                ))}
              </SubjectGrid>
            </CatalogPageTransition>
            <SubjectPagination page={catalog.page} pageCount={catalog.pageCount} onChange={changePage} />
          </>
        )}
      </StudyDashboardLayout>
    </>
  );
}
