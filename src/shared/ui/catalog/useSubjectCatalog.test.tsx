import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSubjectCatalog } from './useSubjectCatalog';

describe('useSubjectCatalog', () => {
  it.each([
    [0, 0, 1],
    [1, 1, 1],
    [12, 12, 1],
    [13, 12, 2],
    [25, 12, 3],
  ])('shows %i subjects as at most %i items on the first of %i pages', (count, firstPageSize, pageCount) => {
    const items = Array.from({ length: count }, (_, index) => ({ id: index, active: index === count - 1 }));
    const { result } = renderHook(() => useSubjectCatalog(`sizes-${count}`, items, (item) => item.active));
    expect(result.current.pageItems).toHaveLength(firstPageSize);
    expect(result.current.pageCount).toBe(pageCount);
  });

  it('resets when filtering and clamps the page when the catalog shrinks', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ id: index, active: index >= 12 }));
    const { result, rerender } = renderHook(
      ({ catalogItems }) => useSubjectCatalog('shrinking', catalogItems, (item) => item.active),
      {
        initialProps: { catalogItems: items },
      },
    );

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    act(() => result.current.setFilter('inProgress'));
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(12);

    act(() => result.current.setFilter('all'));
    act(() => result.current.setPage(3));
    rerender({ catalogItems: items.slice(0, 12) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toHaveLength(12);
  });

  it('reopens on the page and filter the learner left', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ id: index, active: true }));
    const first = renderHook(() => useSubjectCatalog('reopened', items, (item) => item.active));
    act(() => first.result.current.setFilter('inProgress'));
    act(() => first.result.current.setPage(2));
    first.unmount();

    const { result } = renderHook(() => useSubjectCatalog('reopened', items, (item) => item.active));
    expect(result.current.filter).toBe('inProgress');
    expect(result.current.page).toBe(2);
    expect(renderHook(() => useSubjectCatalog('other', items, (item) => item.active)).result.current.page).toBe(1);
  });
});
