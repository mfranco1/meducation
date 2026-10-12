import { Box, Chip, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../../../domain/types';
import type { FlashcardDashboardSubject } from '../selectors/flashcards';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { StudyDashboardLayout } from '../../../shared/ui/catalog/StudyDashboardLayout';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { SubjectCard } from '../../../shared/ui/catalog/SubjectCard';
import { SubjectGrid } from '../../../shared/ui/catalog/SubjectGrid';
import { StatCard } from '../../../shared/ui/catalog/StatCard';
import type { FlashcardProgressState } from '../../../domain/flashcardStudy';
import { useFlashcardDashboardStats } from '../session/useFlashcardDashboardStats';
import { SubjectActivityLabel } from '../../../shared/ui/catalog/SubjectActivityLabel';
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
  const metric = (value: string | number) => (progressError ? '—' : value);
  const catalog = useSubjectCatalog(subjects, (item) => item.activeDeckCount > 0);
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 5 }}>
            <StatCard label="Completed decks" value={metric(stats.completedDecks)} />
            <StatCard label="Average count" value={metric(stats.averagePerDay.toFixed(1))} />
            <StatCard label="Highest count" value={metric(stats.highestInDay)} />
          </Stack>
        }
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
                      <SubjectCard
                        key={item.subject.id}
                        subject={item.subject}
                        onSelect={onSelectSubject}
                        appearance="dashboardGrid"
                      >
                        <Box sx={{ minHeight: 32 }}>
                          <SubjectActivityLabel count={item.activeDeckCount} />
                        </Box>
                      </SubjectCard>
                    ))}
                  </SubjectGrid>
                ) : undefined
              }
            >
              <SubjectGrid>
                {catalog.pageItems.map((item) => (
                  <SubjectCard
                    key={item.subject.id}
                    subject={item.subject}
                    onSelect={onSelectSubject}
                    appearance="dashboardGrid"
                  >
                    <Box sx={{ minHeight: 32 }}>
                      <SubjectActivityLabel count={item.activeDeckCount} />
                    </Box>
                  </SubjectCard>
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
