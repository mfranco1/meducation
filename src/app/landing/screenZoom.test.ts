import { describe, expect, it } from 'vitest';
import { coverQuad, quadToQuad, zoomPath, type Quad } from './screenZoom';

const screen: Quad = [
  [700, 200],
  [1300, 230],
  [1270, 600],
  [690, 560],
];
const viewport: Quad = [
  [0, 0],
  [1440, 0],
  [1440, 900],
  [0, 900],
];

function apply(matrix: string, [x, y]: [number, number]) {
  const m = matrix.slice(9, -1).split(',').map(Number);
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
}

describe('screen zoom', () => {
  it('starts on the photo screen and ends filling the viewport', () => {
    zoomPath(screen, viewport, 0).forEach((point, corner) => {
      expect(point[0]).toBeCloseTo(screen[corner][0]);
      expect(point[1]).toBeCloseTo(screen[corner][1]);
    });
    zoomPath(screen, viewport, 1).forEach((point, corner) => {
      expect(point[0]).toBeCloseTo(viewport[corner][0]);
      expect(point[1]).toBeCloseTo(viewport[corner][1]);
    });
  });

  it('maps each corner of one quad onto the other', () => {
    const matrix = quadToQuad(viewport, screen);
    viewport.forEach((point, corner) => {
      const [x, y] = apply(matrix, point);
      expect(x).toBeCloseTo(screen[corner][0]);
      expect(y).toBeCloseTo(screen[corner][1]);
    });
  });

  it('follows the photo when object-fit cover crops it', () => {
    const marked: Quad = [
      [0.5, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.5, 0.75],
    ];
    // A 2:1 photo in a box of its own shape is not cropped.
    expect(coverQuad(marked, { left: 10, top: 20, width: 800, height: 400 }, 2, [1, 0.5])[0]).toEqual([410, 120]);
    // In a square box it is drawn 800 wide and loses 400 on the left when aligned right.
    expect(coverQuad(marked, { left: 0, top: 0, width: 400, height: 400 }, 2, [1, 0.5])).toEqual([
      [0, 100],
      [200, 100],
      [200, 300],
      [0, 300],
    ]);
    // In a wide box it is drawn 500 tall and loses 300 from the top when aligned to the bottom.
    expect(coverQuad(marked, { left: 0, top: 0, width: 1000, height: 200 }, 2, [0.5, 1])[2]).toEqual([750, 75]);
  });
});
