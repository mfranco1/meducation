import { brand } from '../../../src/shared/brand';

export const themes = {
  cream: { bg: '#f7f2eb', fg: '#27211e', accent: brand.accentColor },
  orange: { bg: brand.accentColor, fg: '#fff8f0', accent: '#ffd2b4' },
  ink: { bg: '#27211e', fg: '#fff8f0', accent: '#EF9B6B' },
};

/** Pixel insets that platform UI (captions, buttons, profile bar) may cover. */
export function safeZone(width: number, height: number) {
  const ratio = width / height;
  const [top, right, bottom, left] =
    ratio < 0.6 ? [0.15, 0.11, 0.2, 0.06] : ratio < 1 ? [0.05, 0.05, 0.1, 0.05] : [0.05, 0.05, 0.05, 0.05];
  return { top: top * height, right: right * width, bottom: bottom * height, left: left * width };
}
