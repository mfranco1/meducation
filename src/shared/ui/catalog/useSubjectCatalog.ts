import { useEffect, useMemo, useRef, useState } from 'react';
import type { SubjectFilter } from './SubjectCatalogControls';

// Kept for the session so a dashboard reopens on the page and filter the learner left.
const savedViews = new Map<string, { filter: SubjectFilter; page: number }>();

export function clearSavedSubjectCatalogViews() {
  savedViews.clear();
}

export type CatalogPageChange<T> = { id: number; from: T[]; resetKey: string; direction: 'next' | 'previous' };

export function useSubjectCatalog<T>(
  catalogId: string,
  items: readonly T[],
  isInProgress: (item: T) => boolean,
  itemId: (item: T) => string,
) {
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

  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const focusAllFilter = useRef(false);
  const [pageChange, setPageChange] = useState<CatalogPageChange<T> | null>(null);
  const resetKey = `${filter}:${items.map(itemId).join(',')}`;
  const changePage = (next: number) => {
    if (next === currentPage) return;
    setPageChange({
      id: (pageChange?.id ?? 0) + 1,
      from: [...pageItems],
      resetKey,
      direction: next > currentPage ? 'next' : 'previous',
    });
    setPage(next);
  };
  useEffect(() => {
    if (focusAllFilter.current && filter === 'all') {
      filterButtonRef.current?.focus();
      focusAllFilter.current = false;
    }
  }, [filter]);
  const showAll = () => {
    focusAllFilter.current = true;
    setFilter('all');
  };

  return {
    filter,
    setFilter,
    showAll,
    filterButtonRef,
    page: currentPage,
    changePage,
    pageChange,
    resetKey,
    pageCount,
    pageItems,
    total: filteredItems.length,
  };
}
