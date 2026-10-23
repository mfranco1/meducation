import { useEffect, useMemo, useState } from 'react';
import type { SubjectFilter } from './SubjectCatalogControls';

// Kept for the session so a dashboard reopens on the page and filter the learner left.
const savedViews = new Map<string, { filter: SubjectFilter; page: number }>();

export function clearSavedSubjectCatalogViews() {
  savedViews.clear();
}

export function useSubjectCatalog<T>(catalogId: string, items: readonly T[], isInProgress: (item: T) => boolean) {
  const [filter, setFilterState] = useState<SubjectFilter>(() => savedViews.get(catalogId)?.filter ?? 'all');
  const [page, setPage] = useState(() => savedViews.get(catalogId)?.page ?? 1);
  const filteredItems = useMemo(
    () => (filter === 'all' ? [...items] : items.filter(isInProgress)),
    [filter, isInProgress, items],
  );
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 12));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filteredItems.slice((currentPage - 1) * 12, currentPage * 12);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  useEffect(() => {
    savedViews.set(catalogId, { filter, page });
  }, [catalogId, filter, page]);

  const setFilter = (next: SubjectFilter) => {
    setFilterState(next);
    setPage(1);
  };

  return { filter, setFilter, page: currentPage, setPage, pageCount, pageItems, total: filteredItems.length };
}
