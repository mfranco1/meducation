import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Composition,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  registerRoot,
  staticFile,
} from 'remotion';
import { Audio } from '@remotion/media';
import Ad from '@ad/Ad';
import raw from '@ad/ad.json';
import { FPS, formatId, formats, specSchema, type AdSpec } from '../spec';

const spec = specSchema.parse(raw);

function Production({ spec }: { spec: AdSpec }) {
  const [handle] = useState(() => delayRender('Load local Inter'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, { weight: '100 900' })
      .load()
      .then((font) => {
        document.fonts.add(font);
        setReady(true);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [handle]);
  return (
    <AbsoluteFill style={{ fontFamily: 'Inter, sans-serif' }}>
      {ready && <Ad spec={spec} />}
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

function Root() {
  return (
    <>
      {spec.formats.map((format) => (
        <Composition
          key={format}
          id={formatId(format)}
          component={Production}
          {...formats[format]}
          fps={FPS}
          durationInFrames={spec.frames}
          defaultProps={{ spec }}
        />
      ))}
    </>
  );
}
registerRoot(Root);
