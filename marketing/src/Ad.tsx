import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  cancelRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { Audio } from '@remotion/media';
import { BrandGraphic } from '../../src/shared/ui/brand/BrandGraphic';
import { brand } from '../../src/shared/brand';
import { type AdSpec, type Scene } from '../spec';
import { progress, Reveal, Rule } from './motion';

const themes = {
  cream: { bg: '#f7f2eb', fg: '#27211e', accent: brand.accentColor },
  orange: { bg: brand.accentColor, fg: '#fff8f0', accent: '#ffd2b4' },
  ink: { bg: '#27211e', fg: '#fff8f0', accent: '#EF9B6B' },
};
const labelStyle = { fontSize: 22, letterSpacing: '0.14em', fontWeight: 650, lineHeight: 1.4 };

function Footage({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const crop = scene.crop ?? { x: 128, y: 250, width: 832, height: 1080 };
  const width = 936;
  const height = (width * crop.height) / crop.width;
  const zoom = interpolate(frame, [0, scene.frames], [1, scene.zoom]);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        borderRadius: 20,
        background: '#fbf8f4',
        boxShadow: '0 28px 80px #00000018',
        border: '1px solid #ffffff40',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${zoom})`,
          transformOrigin: `50% ${scene.position}%`,
        }}
      >
        <OffthreadVideo
          src={staticFile(scene.footage!)}
          trimBefore={scene.trim}
          muted
          style={{
            position: 'absolute',
            width: (width * 960) / crop.width,
            maxWidth: 'none',
            left: (-width * crop.x) / crop.width,
            top: (-width * crop.y) / crop.width,
          }}
        />
      </div>
    </div>
  );
}

function AdScene({ scene, index, first }: { scene: Scene; index: number; first: boolean }) {
  const frame = useCurrentFrame();
  const theme = themes[scene.theme];
  const dark = scene.theme !== 'cream';
  const fade = first ? 1 : progress(frame, 0, 10);
  const lines = scene.headline.split('\n');
  return (
    <AbsoluteFill
      style={{ background: theme.bg, color: theme.fg, opacity: fade, padding: '118px 72px 160px', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 56 }}>
        <BrandGraphic
          size={260}
          theme={dark ? 'dark' : 'light'}
          colorMode={scene.theme === 'orange' ? 'white' : 'fullColor'}
        />
        <span style={{ ...labelStyle, fontSize: 19, opacity: 0.65 }}>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div style={{ marginTop: 35 }}>
        <Rule color={theme.fg} />
      </div>

      {scene.treatment === 'product' ? (
        <>
          <Reveal delay={4} style={{ ...labelStyle, color: theme.accent, marginTop: 38 }}>
            {scene.label}
          </Reveal>
          <div
            style={{
              fontSize: 79,
              lineHeight: 1.04,
              letterSpacing: '-0.055em',
              fontWeight: 750,
              marginTop: 22,
              marginBottom: 35,
            }}
          >
            {lines.map((line, i) => (
              <Reveal key={i} delay={7 + i * 3}>
                {line}
              </Reveal>
            ))}
          </div>
          <Reveal delay={6}>
            <Footage scene={scene} />
          </Reveal>
        </>
      ) : scene.treatment === 'closing' ? (
        <>
          <Reveal delay={4} style={{ ...labelStyle, color: theme.accent, marginTop: 80, maxWidth: 720 }}>
            {scene.label}
          </Reveal>
          <Reveal delay={6} style={{ marginTop: 150 }}>
            <BrandGraphic variant="icon" size={230} theme="light" />
          </Reveal>
          <Reveal delay={10} style={{ marginTop: 55 }}>
            <BrandGraphic variant="wordmark" size={780} theme="light" />
          </Reveal>
          <Reveal delay={15} style={{ fontSize: 34, lineHeight: 1.5, maxWidth: 670, marginTop: 44, opacity: 0.75 }}>
            {scene.detail}
          </Reveal>
          <Reveal
            delay={20}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 125,
              borderTop: `2px solid ${theme.fg}`,
              paddingTop: 34,
              fontWeight: 650,
              fontSize: 65,
              letterSpacing: '-0.04em',
            }}
          >
            <span>{scene.headline}</span>
            <span style={{ color: theme.accent }}>↗</span>
          </Reveal>
        </>
      ) : (
        <>
          <Reveal delay={0} style={{ ...labelStyle, color: theme.accent, marginTop: 70 }}>
            {scene.label}
          </Reveal>
          <div
            style={{
              fontSize: scene.theme === 'orange' ? 180 : 132,
              lineHeight: 0.98,
              fontWeight: 780,
              letterSpacing: '-0.055em',
              marginTop: scene.theme === 'orange' ? 130 : 65,
            }}
          >
            {lines.map((line, i) => (
              <div key={i} style={{ overflow: 'hidden', paddingBottom: 12 }}>
                <div style={{ transform: `translateY(${(1 - progress(frame, 2 + i * 5, 22)) * 115}%)` }}>{line}</div>
              </div>
            ))}
          </div>
          {scene.poster ? (
            <Reveal delay={10} style={{ marginTop: 75 }}>
              <div
                style={{
                  height: 670,
                  overflow: 'hidden',
                  borderRadius: 12,
                  transform: `rotate(-3deg) translateX(${(1 - progress(frame, 10, 35)) * 80}px)`,
                  boxShadow: '0 28px 70px #27211e18',
                  background: '#fffcf8',
                }}
              >
                <Img
                  src={staticFile(scene.poster)}
                  style={{ width: 1080, maxWidth: 'none', transform: 'translate(-144px,-390px)' }}
                />
              </div>
            </Reveal>
          ) : (
            <>
              <div
                style={{
                  marginTop: 110,
                  width: `${progress(frame, 15, 30) * 100}%`,
                  height: 7,
                  background: theme.accent,
                }}
              />
              <Reveal delay={18} style={{ marginTop: 85 }}>
                <BrandGraphic variant="icon" size={150} theme="dark" colorMode="white" />
              </Reveal>
            </>
          )}
        </>
      )}

      <div style={{ position: 'absolute', bottom: 153, left: 72, right: 72 }}>
        {scene.treatment !== 'closing' && (
          <Reveal delay={14} style={{ fontSize: 27, lineHeight: 1.5, marginBottom: 25, opacity: 0.75 }}>
            {scene.detail}
          </Reveal>
        )}
        <Rule color={theme.fg} />
        <div
          style={{
            ...labelStyle,
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 20,
            fontSize: 18,
            opacity: 0.65,
          }}
        >
          <span>{brand.name.toUpperCase()}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function Ad({ spec }: { spec: AdSpec }) {
  const [handle] = useState(() => delayRender('Load local Inter'));
  useEffect(() => {
    const font = new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' });
    font
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [handle]);
  let start = 0;
  return (
    <AbsoluteFill style={{ background: themes.cream.bg, fontFamily: 'Inter, sans-serif' }}>
      {spec.scenes.map((scene, index) => {
        const from = start;
        start += scene.frames;
        return (
          <Sequence
            key={index}
            from={from}
            durationInFrames={scene.frames + (index < spec.scenes.length - 1 ? 10 : 0)}
            premountFor={30}
          >
            <AdScene scene={scene} index={index} first={index === 0} />
          </Sequence>
        );
      })}
      {spec.audio.map((audio, index) => (
        <Sequence key={index} from={audio.from} durationInFrames={audio.frames}>
          <Audio
            src={staticFile(audio.src)}
            trimBefore={audio.trim}
            volume={(frame) =>
              audio.volume *
              Math.min(1, audio.fade ? frame / audio.fade : 1, audio.fade ? (audio.frames - 1 - frame) / audio.fade : 1)
            }
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
