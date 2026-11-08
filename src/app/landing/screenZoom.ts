/** Corners in viewport pixels, clockwise from top left. */
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

type Matrix = [number, number, number, number, number, number, number, number, number];

/** The laptop display in the landing hero photo, as fractions of the image. */
const photoScreen: Quad = [
  [0.4701, 0.137],
  [0.9375, 0.1685],
  [0.9097, 0.5713],
  [0.4396, 0.5213],
];

const duration = 1300;
const steps = 60;

/** Projective map from the unit square onto a quad (Heckbert). */
function squareTo([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): Matrix {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array(9).fill(0) as Matrix;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) for (let k = 0; k < 3; k++) out[row * 3 + col] += a[row * 3 + k] * b[k * 3 + col];
  return out;
}

function invert([a, b, c, d, e, f, g, h, i]: Matrix): Matrix {
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

/** CSS matrix3d that maps one quad onto another, for an element with transform-origin at the viewport's top left. */
export function quadToQuad(from: Quad, to: Quad): string {
  const [a, b, c, d, e, f, g, h, i] = multiply(squareTo(to), invert(squareTo(from)));
  return `matrix3d(${[a / i, d / i, 0, g / i, b / i, e / i, 0, h / i, 0, 0, 1, 0, c / i, f / i, 0, 1].join(',')})`;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const centerOf = (quad: Quad) => [0, 1].map((axis) => quad.reduce((sum, point) => sum + point[axis], 0) / 4);
const sizeOf = ([tl, tr, , bl]: Quad) =>
  Math.sqrt(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) * Math.hypot(bl[0] - tl[0], bl[1] - tl[1]));

/**
 * The screen's path from the photo to the full viewport. It grows at an even
 * rate about one fixed point, like a camera pushing in, while its shape
 * squares up to face the viewer.
 */
export function zoomPath(screen: Quad, viewport: Quad, step: number): Quad {
  const [startSize, endSize] = [sizeOf(screen), sizeOf(viewport)];
  const [start, end] = [centerOf(screen), centerOf(viewport)];
  const ratio = endSize / startSize;
  const fixed = [0, 1].map((axis) => (end[axis] - ratio * start[axis]) / (1 - ratio));
  const size = startSize * ratio ** step;
  const center = [0, 1].map((axis) => fixed[axis] + (start[axis] - fixed[axis]) * (size / startSize));
  return screen.map((point, corner) =>
    [0, 1].map((axis) => {
      const from = (point[axis] - start[axis]) / startSize;
      const to = (viewport[corner][axis] - end[axis]) / endSize;
      return center[axis] + (from + (to - from) * step) * size;
    }),
  ) as Quad;
}

/** The photo's screen in viewport pixels when enough of the photo is in view to zoom into it. */
export function photoScreenQuad(photo: HTMLElement): Quad | undefined {
  const rect = photo.getBoundingClientRect();
  const visible = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  if (visible < rect.height * 0.7 || innerWidth < innerHeight * 1.25) return undefined;
  return photoScreen.map(([x, y]) => [rect.left + x * rect.width, rect.top + y * rect.height]) as Quad;
}

/**
 * Pushes the camera into the photo's screen. The landing page carries the
 * photo toward the viewer while the app layer, mapped onto the screen, grows
 * to fill the viewport and fades in. Ends with the app layer untransformed.
 */
export async function zoomIntoScreen(screen: Quad, landing: HTMLElement, app: HTMLElement) {
  const viewport: Quad = [
    [0, 0],
    [innerWidth, 0],
    [innerWidth, innerHeight],
    [0, innerHeight],
  ];
  const landingFrames: Keyframe[] = [];
  const appFrames: Keyframe[] = [];
  for (let index = 0; index <= steps; index++) {
    const quad = zoomPath(screen, viewport, easeInOut(index / steps));
    landingFrames.push({ transform: quadToQuad(screen, quad) });
    appFrames.push({ transform: quadToQuad(viewport, quad) });
  }
  landing.style.transformOrigin = `${scrollX}px ${scrollY}px`;
  Object.assign(app.style, { position: 'fixed', inset: '0', zIndex: '1', overflow: 'hidden', transformOrigin: '0 0' });
  const timing = { duration, fill: 'both' } as const;
  const animations = [
    landing.animate(landingFrames, timing),
    app.animate(appFrames, timing),
    app.animate([{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], {
      ...timing,
      easing: 'ease-out',
    }),
  ];
  await Promise.all(animations.map((animation) => animation.finished));
  return () => {
    animations.forEach((animation) => animation.cancel());
    app.removeAttribute('style');
    landing.removeAttribute('style');
  };
}
