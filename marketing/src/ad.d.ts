declare module '@ad/Ad' {
  import type { ComponentType } from 'react';
  import type { AdSpec } from '../spec';
  const Ad: ComponentType<{ spec: AdSpec }>;
  export default Ad;
}
declare module '@ad/ad.json' {
  const spec: unknown;
  export default spec;
}
