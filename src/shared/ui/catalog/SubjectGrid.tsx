import { Fragment, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { CatalogPageTransition } from './CatalogPageTransition';
import type { CatalogPageChange } from './useSubjectCatalog';

export function SubjectGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      data-testid="all-subjects-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
        gap: 2,
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  );
}

export function SubjectCatalogPage<T>({
  catalog,
  itemKey,
  renderItem,
}: {
  catalog: { pageItems: T[]; pageChange: CatalogPageChange<T> | null; resetKey: string };
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const { pageChange, resetKey } = catalog;
  const grid = (items: T[]) => (
    <SubjectGrid>
      {items.map((item) => (
        <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
      ))}
    </SubjectGrid>
  );
  return (
    <CatalogPageTransition
      requestId={pageChange?.id ?? 0}
      resetKey={resetKey}
      direction={pageChange?.direction ?? 'next'}
      previousPage={pageChange?.resetKey === resetKey ? grid(pageChange.from) : undefined}
    >
      {grid(catalog.pageItems)}
    </CatalogPageTransition>
  );
}
