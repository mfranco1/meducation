import { expect, it } from 'vitest';
import { reorderTarget } from './reorder';

const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
it('places a record after the sibling two above, or first, when moving up', () => {
  expect(reorderTarget(rows, 'c', -1)).toEqual({ afterId: 'a' });
  expect(reorderTarget(rows, 'b', -1)).toEqual({ afterId: null });
  expect(reorderTarget(rows, 'a', -1)).toBeUndefined();
});
it('places a record after the next sibling when moving down', () => {
  expect(reorderTarget(rows, 'a', 1)).toEqual({ afterId: 'b' });
  expect(reorderTarget(rows, 'c', 1)).toEqual({ afterId: 'd' });
  expect(reorderTarget(rows, 'd', 1)).toBeUndefined();
  expect(reorderTarget(rows, 'zzz', 1)).toBeUndefined();
});
