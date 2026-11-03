import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudyCardIllustration } from './StudyCardIllustration';

describe('StudyCardIllustration', () => {
  it('shows the subject hero photo as a decorative responsive image', () => {
    const { container } = render(<StudyCardIllustration subjectId="s6" />);
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('src', '/assets/illustrations/ob-hero-600.webp');
    expect(image?.getAttribute('srcset')).toContain('/assets/illustrations/ob-hero-1192.webp 1192w');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws subjects without a hero with unique local SVG definitions and the fallback icon', () => {
    const { container } = render(
      <>
        <StudyCardIllustration subjectId="new-subject" />
        <StudyCardIllustration subjectId="unrecognized-subject" />
      </>,
    );
    const svgs = [...container.querySelectorAll('svg[viewBox="0 0 360 270"]')];
    expect(svgs).toHaveLength(2);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[1]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0]?.querySelector('[data-subject-icon="new-subject"]')).toBeInTheDocument();
    expect(svgs[1]?.querySelector('[data-subject-icon="unrecognized-subject"]')).toHaveAttribute(
      'data-icon-name',
      'book',
    );

    const ids = svgs.map((svg) => [...svg.querySelectorAll('[id]')].map((node) => node.id));
    expect(ids[0]!.some((id) => ids[1]!.includes(id))).toBe(false);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
