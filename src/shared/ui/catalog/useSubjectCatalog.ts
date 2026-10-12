import { useEffect, useMemo, useState } from 'react';
import type { SubjectFilter } from './SubjectCatalogControls';

export function useSubjectCatalog<T>(items: readonly T[], isInProgress: (item: T) => boolean) {
  const [filter, setFilterState] = useState<SubjectFilter>('all');
  const [page, setPage] = useState(1);
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

  const setFilter = (next: SubjectFilter) => {
    setFilterState(next);
    setPage(1);
  };

  return { filter, setFilter, page: currentPage, setPage, pageCount, pageItems, total: filteredItems.length };
}
