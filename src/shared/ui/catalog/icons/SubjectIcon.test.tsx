import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../theme';
import { SubjectIcon } from './SubjectIcon';

describe('SubjectIcon', () => {
  it.each([
    ['s1', 'bone'],
    ['s2', 'DeviceHubOutlined'],
    ['s3', 'BalanceOutlined'],
    ['s4', 'FavoriteBorderOutlined'],
    ['s5', 'CoronavirusOutlined'],
    ['s6', 'uterus'],
    ['s7', 'BiotechOutlined'],
    ['s8', 'ChildCareOutlined'],
    ['s9', 'capsule'],
    ['s10', 'MonitorHeartOutlined'],
    ['s11', 'HealthAndSafetyOutlined'],
    ['s12', 'scalpel'],
    ['s13', 'GridViewOutlined'],
    ['unknown', 'GridViewOutlined'],
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

  it('renders the grid fallback for an unknown subject id', () => {
    render(
      <ThemeProvider theme={theme}>
        <SubjectIcon subjectId="future-subject" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('GridViewOutlinedIcon')).toBeInTheDocument();
  });

  it('uses a 24-unit view box for custom icons', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SubjectIcon subjectId="s1" />
      </ThemeProvider>,
    );
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
  });
});
