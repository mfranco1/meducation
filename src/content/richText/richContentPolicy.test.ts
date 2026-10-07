import { describe, expect, it } from 'vitest';
import { isAllowedImageUrl, isAllowedLinkUrl } from './richContentPolicy';

describe('rich content URL policy', () => {
  it('allows local images and explicitly approved HTTPS origins', () => {
    expect(isAllowedImageUrl('/content/figures/nerve.png')).toBe(true);
    expect(isAllowedImageUrl('https://assets.example.test/figure.png', new Set(['https://assets.example.test']))).toBe(true);
  });

  it('rejects unsafe or unapproved image URLs', () => {
    expect(isAllowedImageUrl('//assets.example.test/figure.png')).toBe(false);
    expect(isAllowedImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageUrl('https://assets.example.test/figure.png')).toBe(false);
  });

  it('limits links to web and mail protocols', () => {
    expect(isAllowedLinkUrl('https://example.test/reference')).toBe(true);
    expect(isAllowedLinkUrl('mailto:editor@example.test')).toBe(true);
    expect(isAllowedLinkUrl('javascript:alert(1)')).toBe(false);
  });
});
