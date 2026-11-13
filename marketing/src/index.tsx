import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Composition,
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

// A soundtrack may be a module name that only the CLI resolves; the page needs just to know one exists.
const { soundtrack, ...rest } = raw as Record<string, unknown>;
const spec = specSchema.parse(rest);
const hasSoundtrack = soundtrack !== undefined;

function Production({ spec }: { spec: AdSpec }) {
  const [handle] = useState(() => delayRender('Load local DM Sans'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    new FontFace('DM Sans', `url(${staticFile('fonts/DMSansVariable.woff2')})`, { weight: '100 900' })
      .load()
      .then((font) => {
        document.fonts.add(font);
        setReady(true);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [handle]);
  return (
    <AbsoluteFill style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {ready && <Ad spec={spec} />}
      {hasSoundtrack && <Audio src={staticFile(`audio/${spec.id}/mix.wav`)} />}
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
