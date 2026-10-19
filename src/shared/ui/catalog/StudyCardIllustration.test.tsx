import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StudyCardIllustration } from './StudyCardIllustration';

describe('StudyCardIllustration', () => {
  it('uses unique local SVG definitions and the stable subject icon registry', () => {
    const { container } = render(
      <>
        <StudyCardIllustration subjectId="s6" />
        <StudyCardIllustration subjectId="unrecognized-subject" />
      </>,
    );
    const svgs = [...container.querySelectorAll('svg[viewBox="0 0 360 270"]')];
    expect(svgs).toHaveLength(2);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[1]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0]?.querySelector('[data-subject-icon="s6"]')).toBeInTheDocument();
    expect(svgs[1]?.querySelector('[data-subject-icon="unrecognized-subject"]')).toHaveAttribute(
      'data-icon-name',
      'book',
    );

    const definitionIds = svgs.map((svg) => new Set([...svg.querySelectorAll('[id]')].map((node) => node.id)));
    expect([...definitionIds[0]!].some((id) => definitionIds[1]!.has(id))).toBe(false);
    for (const [index, svg] of svgs.entries()) {
      const ids = definitionIds[index]!;
      const references = [...svg.querySelectorAll('[fill], [filter]')]
        .flatMap((node) => [node.getAttribute('fill'), node.getAttribute('filter')])
        .filter((value): value is string => Boolean(value?.startsWith('url(#')))
        .map((value) => value.slice(5, -1));
      expect(references.length).toBeGreaterThan(0);
      references.forEach((reference) => expect(ids.has(reference)).toBe(true));
    }
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
