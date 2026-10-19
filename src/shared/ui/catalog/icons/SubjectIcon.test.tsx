import { ThemeProvider } from '@mui/material';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../theme';
import { SubjectIcon } from './SubjectIcon';

describe('SubjectIcon', () => {
  it.each([
    ['s1', 'knee-joint'],
    ['s2', 'dna'],
    ['s3', 'scales'],
    ['s4', 'stethoscope'],
    ['s5', 'virus'],
    ['s6', 'fetus'],
    ['s7', 'microscope'],
    ['s8', 'infant'],
    ['s9', 'pills'],
    ['s10', 'heart'],
    ['s11', 'syringe'],
    ['s12', 'scalpel'],
    ['unknown', 'book'],
  ])('maps %s to %s as a decorative icon', (subjectId, iconName) => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SubjectIcon subjectId={subjectId} />
      </ThemeProvider>,
    );
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('data-subject-icon', subjectId);
    expect(icon).toHaveAttribute('data-icon-name', iconName);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
    expect(icon).not.toHaveAttribute('title');
  });

  it('uses a 24-unit view box', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SubjectIcon subjectId="s1" />
      </ThemeProvider>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
  });
});
