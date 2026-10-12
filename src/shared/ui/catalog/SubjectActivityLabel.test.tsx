import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectActivityLabel } from './SubjectActivityLabel';

describe('SubjectActivityLabel', () => {
  it('omits the status for zero items', () => {
    const { container } = render(<SubjectActivityLabel count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([1, 3])('shows the count for %i active items', count => {
    render(<SubjectActivityLabel count={count} />);
    expect(screen.getByText(`${count} in progress`)).toBeVisible();
  });
});
