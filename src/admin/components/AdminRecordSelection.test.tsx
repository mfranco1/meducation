import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useAdminRecordSelection } from './AdminRecordSelection';

it('keeps selections across pages, clears them on search or parent change, and excludes removed rows', () => {
  const { result, rerender } = renderHook(({ scope, ids }) => useAdminRecordSelection(scope, ids), { initialProps: { scope: 'q1:', ids: ['i1', 'i2', 'i3'] } });
  act(() => { result.current.begin(); result.current.selectPage(['i1', 'i2']); });
  act(() => result.current.selectPage(['i3']));
  expect(result.current.ids).toEqual(['i1', 'i2', 'i3']);
  rerender({ scope: 'q1:', ids: ['i2', 'i3'] });
  expect(result.current.ids).toEqual(['i2', 'i3']);
  rerender({ scope: 'q1:', ids: ['i1', 'i2', 'i3'] });
  expect(result.current.ids).toEqual(['i2', 'i3']);
  rerender({ scope: 'q1:search', ids: ['i2', 'i3'] });
  expect(result.current.ids).toEqual([]);
  expect(result.current.enabled).toBe(false);
  act(() => { result.current.begin(); result.current.toggle('i2'); });
  rerender({ scope: 'q2:', ids: ['i4'] });
  expect(result.current.ids).toEqual([]);
});
