import { ThemeProvider } from '@mui/material';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../theme';
import { TopicIcon } from './TopicIcon';

const renderIcon = (topicId: string, subjectId: string) => render(
  <ThemeProvider theme={theme}>
    <TopicIcon topicId={topicId} subjectId={subjectId} />
  </ThemeProvider>,
).container.querySelector('svg');

describe('TopicIcon', () => {
  it('shows the topic icon as a decorative 24-unit icon', () => {
    const icon = renderIcon('t89', 's4');
    expect(icon).toHaveAttribute('data-topic-icon', 't89');
    expect(icon).toHaveAttribute('data-icon-name', 'kidney');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('falls back to the subject icon for topics without one', () => {
    const icon = renderIcon('t4', 's4');
    expect(icon).toHaveAttribute('data-subject-icon', 's4');
    expect(icon).toHaveAttribute('data-icon-name', 'stethoscope');
  });
});
