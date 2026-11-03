import { AbsoluteFill, Composition, getInputProps, registerRoot, Still } from 'remotion';
import { duration, FPS, HEIGHT, specSchema, WIDTH } from '../spec';
import { Ad } from './Ad';

function Instructions() {
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        padding: 100,
        fontFamily: 'sans-serif',
        fontSize: 48,
        background: '#f7f2eb',
        color: '#27211e',
      }}
    >
      Load an ad specification with --props.
    </AbsoluteFill>
  );
}

function Root() {
  const input = getInputProps<Record<string, unknown>>();
  if (!Object.keys(input).length)
    return <Still id="Instructions" component={Instructions} width={WIDTH} height={HEIGHT} />;
  const spec = specSchema.parse(input.spec ?? input);
  return (
    <Composition
      id="Meducation"
      component={Ad}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={duration(spec)}
      defaultProps={{ spec }}
      calculateMetadata={({ props }) => ({ durationInFrames: duration(props.spec) })}
    />
  );
}
registerRoot(Root);
