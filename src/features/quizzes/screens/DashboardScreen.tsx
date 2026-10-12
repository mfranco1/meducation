import { Box, Button, Stack, Typography } from '@mui/material';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CompletedAttempt, Subject } from '../../../domain/types';
import { activeSubjectStats, type SubjectStat } from '../selectors/dashboard';
import { ActiveSubjectCarousel } from '../components/ActiveSubjectCarousel';
import { StatCard } from '../../../shared/ui/catalog/StatCard';
import { StatCardRow } from '../../../shared/ui/catalog/StatCardRow';
import { QuizSubjectCard } from '../components/QuizSubjectCard';
import { SubjectGrid } from '../../../shared/ui/catalog/SubjectGrid';
import { StudyDashboardLayout } from '../../../shared/ui/catalog/StudyDashboardLayout';
import { LoadingSkeleton } from '../../../shared/ui/loading/LoadingSkeleton';
import { ContentRecoveryBanner } from '../../../shared/ui/loading/ContentRecoveryBanner';
import { SubjectCardSkeleton } from '../../../shared/ui/catalog/SubjectCardSkeleton';
import { SubjectFilterPill, SubjectPagination } from '../../../shared/ui/catalog/SubjectCatalogControls';
import { useSubjectCatalog } from '../../../shared/ui/catalog/useSubjectCatalog';
import { SubjectCatalogEmptyState } from '../../../shared/ui/catalog/SubjectCatalogEmptyState';
import { CatalogPageTransition } from '../../../shared/ui/catalog/CatalogPageTransition';

type CatalogPageChange = { id: number; from: SubjectStat[]; resetKey: string; direction: 'next' | 'previous' };

export type { SubjectStat } from '../selectors/dashboard';

function StatFailure({
  label,
  accessibleLabel,
  supportingText,
  icon,
  onRetry,
}: {
  label: string;
  accessibleLabel: string;
  supportingText: string;
  icon: ReactNode;
  onRetry: () => void;
}) {
  return (
    <StatCard
      label={label}
      accessibleLabel={accessibleLabel}
      supportingText={supportingText}
      icon={icon}
      value="—"
      footer={
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ErrorOutlineRoundedIcon color="error" sx={{ fontSize: 16 }} aria-hidden="true" />
            <Typography color="text.secondary" variant="caption">
              Couldn’t load
            </Typography>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRetry}
            aria-label={`Retry ${label.toLowerCase()} statistics`}
            sx={{ minHeight: 36, px: 1 }}
          >
            Retry
          </Button>
        </Stack>
      }
    />
  );
}

function ScoreValue({ value }: { value: number }) {
  return (
    <>
      {value}
      <span className="stat-suffix">%</span>
    </>
  );
}

function SubjectPlaceholders({ dashed = false }: { dashed?: boolean }) {
  return (
    <SubjectGrid>
      {Array.from({ length: 6 }, (_, index) => (
        <SubjectCardSkeleton key={index} dashed={dashed} />
      ))}
    </SubjectGrid>
  );
}

function SubjectFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <Box sx={{ position: 'relative' }}>
      <SubjectPlaceholders dashed />
      <Stack
        alignItems="center"
        spacing={1}
        sx={{ position: 'absolute', inset: 0, justifyContent: 'center', pointerEvents: 'none' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700, bgcolor: 'background.default', px: 1 }}>
          Couldn’t load subjects
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshRoundedIcon />}
          onClick={onRetry}
          sx={{ pointerEvents: 'auto', minHeight: 40 }}
        >
          Retry
        </Button>
      </Stack>
    </Box>
  );
}

export function DashboardScreen({
  attempts,
  subjectStats,
  averageLatest,
  personalLowest,
  personalLowestSubject,
  loading = false,
  retrying = false,
  statsLoading = false,
  activeAttempts = false,
  error,
  retryAt,
  onRetry = () => undefined,
  onSelectSubject,
  statsError,
  subjectsError,
}: {
  attempts: readonly CompletedAttempt[];
  subjectStats: SubjectStat[];
  averageLatest?: number;
  personalLowest?: number;
  personalLowestSubject?: string;
  loading?: boolean;
  retrying?: boolean;
  statsLoading?: boolean;
  activeAttempts?: boolean;
  error?: Error;
  retryAt?: number;
  onRetry?: () => void | Promise<void>;
  onSelectSubject: (subject: Subject) => void;
  statsError?: Error;
  subjectsError?: Error;
}) {
  const [manualRetryPending, setManualRetryPending] = useState(false);
  const manualRetryStarted = useRef(false);
  useEffect(() => {
    if (!manualRetryPending) {
      manualRetryStarted.current = false;
      return;
    }
    if (loading || retrying) manualRetryStarted.current = true;
    else if (manualRetryStarted.current) setManualRetryPending(false);
  }, [loading, manualRetryPending, retrying]);
  const sharedError = error;
  const statsFailure = !sharedError && statsError;
  const subjectsFailure = !sharedError && subjectsError;
  const handleRetry = () => {
    manualRetryStarted.current = false;
    setManualRetryPending(true);
    return onRetry();
  };
  const sharedRecovery = Boolean(sharedError || retrying || manualRetryPending);
  const catalog = useSubjectCatalog(subjectStats, (stat) => stat.activeQuizCount > 0);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const focusAllFilter = useRef(false);
  const [pageChange, setPageChange] = useState<CatalogPageChange | null>(null);
  const resetKey = `${catalog.filter}:${subjectStats.map(({ subject }) => subject.id).join(',')}`;
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
      {sharedRecovery && (
        <ContentRecoveryBanner
          testId="dashboard-error-banner"
          error={sharedError}
          retrying={retrying}
          busy={manualRetryPending && loading}
          retryAt={retryAt}
          onRetry={handleRetry}
        />
      )}
      <StudyDashboardLayout
        subjectsActions={
          <SubjectFilterPill
            value={catalog.filter}
            onChange={catalog.setFilter}
            disabled={
              loading || Boolean(sharedError || retrying || manualRetryPending || subjectsFailure || statsFailure)
            }
            allButtonRef={filterButtonRef}
          />
        }
        summary={
          <StatCardRow>
            <StatCard
              label="Completed"
              accessibleLabel="Completed quizzes"
              icon={<MenuBookOutlinedIcon fontSize="inherit" aria-hidden="true" focusable="false" />}
              value={attempts.length}
              supportingText="quizzes"
            />
            {sharedRecovery ? (
              <>
                <StatCard
                  label="Average"
                  accessibleLabel="Average quiz score"
                  icon={<BarChartOutlinedIcon aria-hidden="true" focusable="false" />}
                  supportingText="correct"
                  value={null}
                />
                <StatCard
                  label="Lowest"
                  accessibleLabel="Lowest quiz score"
                  icon={<EmojiEventsOutlinedIcon aria-hidden="true" focusable="false" />}
                  supportingText=""
                  value={null}
                />
              </>
            ) : statsFailure ? (
              <>
                <StatFailure
                  label="Average"
                  accessibleLabel="Average quiz score"
                  supportingText="correct"
                  icon={<BarChartOutlinedIcon fontSize="inherit" aria-hidden="true" focusable="false" />}
                  onRetry={onRetry}
                />
                <StatFailure
                  label="Lowest"
                  accessibleLabel="Lowest quiz score"
                  supportingText={personalLowestSubject ?? ''}
                  icon={<EmojiEventsOutlinedIcon fontSize="inherit" aria-hidden="true" focusable="false" />}
                  onRetry={onRetry}
                />
              </>
            ) : (
              <>
                <StatCard
                  label="Average"
                  accessibleLabel="Average quiz score"
                  icon={<BarChartOutlinedIcon fontSize="inherit" aria-hidden="true" focusable="false" />}
                  supportingText="correct"
                  value={statsLoading ? null : averageLatest === undefined ? '—' : <ScoreValue value={averageLatest} />}
                />
                <StatCard
                  label="Lowest"
                  accessibleLabel="Lowest quiz score"
                  icon={<EmojiEventsOutlinedIcon fontSize="inherit" aria-hidden="true" focusable="false" />}
                  supportingText={statsLoading ? '' : (personalLowestSubject ?? '')}
                  supportingTextSx={{ color: 'primary.dark' }}
                  value={
                    statsLoading ? null : personalLowest === undefined ? '—' : <ScoreValue value={personalLowest} />
                  }
                />
              </>
            )}
          </StatCardRow>
        }
        continueStudying={
          (loading || retrying || sharedError || manualRetryPending) && activeAttempts ? (
            <Box
              sx={{ mb: 3 }}
              role="status"
              aria-busy={!sharedError}
              aria-label={retrying ? 'Retrying active subjects' : 'Loading active subjects'}
            >
              <LoadingSkeleton variant="rounded" height={122} />
            </Box>
          ) : !loading && !sharedError && !subjectsFailure && !retrying && !manualRetryPending ? (
            <ActiveSubjectCarousel subjects={activeSubjectStats(subjectStats)} onSelectSubject={onSelectSubject} />
          ) : null
        }
      >
        {sharedRecovery ? (
          <SubjectPlaceholders />
        ) : subjectsFailure ? (
          <SubjectFailure onRetry={onRetry} />
        ) : loading ? (
          <Box role="status" aria-busy="true" aria-label="Loading subjects">
            <SubjectPlaceholders />
          </Box>
        ) : subjectStats.length === 0 ? (
          <SubjectCatalogEmptyState title="No subjects are available yet." />
        ) : (statsFailure || sharedError) && catalog.filter === 'inProgress' ? (
          <Box role="status" aria-live="polite" sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
            In-progress subjects are unavailable right now.
          </Box>
        ) : (
          <>
            {catalog.total === 0 ? (
              <SubjectCatalogEmptyState
                title="No subjects in progress"
                onShowAll={
                  subjectStats.length > 0
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
                        {pageChange.from.map((stat) => (
                          <QuizSubjectCard
                            key={stat.subject.id}
                            stat={stat}
                            onSelect={onSelectSubject}
                            appearance="dashboardGrid"
                          />
                        ))}
                      </SubjectGrid>
                    ) : undefined
                  }
                >
                  <SubjectGrid>
                    {catalog.pageItems.map((stat) => (
                      <QuizSubjectCard
                        key={stat.subject.id}
                        stat={stat}
                        onSelect={onSelectSubject}
                        appearance="dashboardGrid"
                      />
                    ))}
                  </SubjectGrid>
                </CatalogPageTransition>
                <SubjectPagination page={catalog.page} pageCount={catalog.pageCount} onChange={changePage} />
              </>
            )}
          </>
        )}
      </StudyDashboardLayout>
    </>
  );
}
