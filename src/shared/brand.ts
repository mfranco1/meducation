const wordmark = { emphasis: 'Med', remainder: 'ucation' } as const;

const standardPage = `M 10 19 L 55.5 42 Q 60 44.3 60 49.3 L 60 102 Q 60 108 54.8 104.7 L 30.8 89.4 Q 27 87 23.2 89.4 L 9.2 98.3 Q 4 101.6 4 95.5 L 4 23 Q 4 16 10 19 Z`;
const smallPage = `M 10 21 L 53.5 43 Q 58 45.3 58 50.3 L 58 101 Q 58 107 52.8 103.7 L 30.8 89.4 Q 27 87 23.2 89.4 L 9.2 98.3 Q 4 101.6 4 95.5 L 4 25 Q 4 18 10 21 Z`;

export const brand = {
  name: `${wordmark.emphasis}${wordmark.remainder}`,
  wordmark,
  accentColor: '#b9511b',
  faviconUrl: '/favicon.svg',
  palette: {
    light: { left: '#C45117', right: '#EF9B6B', text: '#262626' },
    dark: { left: '#EF9B6B', right: '#FFC39E', text: '#FFFFFF' },
  },
  mark: {
    viewBox: '0 0 128 112',
    page: standardPage,
    smallPage,
    rail: 'M 13 8 L 57 30.2',
    railWidth: 6,
    smallRailWidth: 8,
    reflection: 'translate(128 0) scale(-1 1)',
  },
} as const;
