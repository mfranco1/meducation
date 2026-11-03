import type { CSSProperties } from 'react';
import { OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { brand } from '../../../src/shared/brand';
import { ease } from './motion';

type Keyframe = { frame: number; zoom: number; x: number; y: number };
type Tap = { t: number; x: number; y: number };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease } as const;

function cameraAt(camera: Keyframe[], frame: number) {
  const frames = camera.map((k) => k.frame);
  const at = (key: 'zoom' | 'x' | 'y') =>
    camera.length === 1
      ? camera[0][key]
      : interpolate(
          frame,
          frames,
          camera.map((k) => k[key]),
          clamp,
        );
  return { zoom: at('zoom'), x: at('x'), y: at('y') };
}

/** A region of a captured product video. Camera and tap coordinates are source pixels. */
export function Footage({
  src,
  width,
  crop,
  sourceWidth = 960,
  sourceHeight = 1800,
  trimBefore = 0,
  camera,
  taps = [],
  radius = 20,
  style,
}: {
  src: string;
  width: number;
  crop?: { x: number; y: number; width: number; height: number };
  sourceWidth?: number;
  sourceHeight?: number;
  trimBefore?: number;
  camera?: Keyframe[];
  taps?: Tap[];
  radius?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const scale = width / c.width;
  const height = c.height * scale;
  const view = camera?.length ? cameraAt(camera, frame) : { zoom: 1, x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const sourceSeconds = (frame + trimBefore) / fps;
  const toPx = (x: number, y: number) => ({ left: (x - c.x) * scale, top: (y - c.y) * scale });
  const focus = toPx(view.x, view.y);

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', borderRadius: radius, ...style }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${width / 2}px, ${height / 2}px) scale(${view.zoom}) translate(${-focus.left}px, ${-focus.top}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          trimBefore={trimBefore}
          muted
          style={{
            position: 'absolute',
            maxWidth: 'none',
            width: sourceWidth * scale,
            ...toPx(0, 0),
          }}
        />
        {taps.map((tap, i) => {
          const age = sourceSeconds - tap.t;
          if (age < 0 || age > 0.5) return null;
          const p = interpolate(age, [0, 0.5], [0, 1], { easing: ease });
          const ring = (36 + 84 * p) * (width / 936);
          const dot = 22 * (width / 936) * (1 - p);
          const center = { position: 'absolute', transform: 'translate(-50%, -50%)', borderRadius: '50%' } as const;
          const pos = toPx(tap.x, tap.y);
          return (
            <div key={i}>
              <div
                style={{
                  ...center,
                  ...pos,
                  width: ring,
                  height: ring,
                  border: `${6 * (width / 936)}px solid ${brand.palette.light.right}`,
                  background: `${brand.palette.light.right}33`,
                  opacity: 1 - p,
                }}
              />
              <div style={{ ...center, ...pos, width: dot, height: dot, background: brand.accentColor }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
