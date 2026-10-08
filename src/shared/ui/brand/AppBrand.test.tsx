import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { brand } from '../../brand';
import { AppBrand } from './AppBrand';

describe('AppBrand', () => {
  it('renders a static, decorative wordmark without a button', () => {
    render(<AppBrand />);
    expect(document.body).toHaveTextContent(brand.name);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the canonical name for compact navigation and invokes its action', () => {
    const onClick = vi.fn();
    render(<AppBrand compact onClick={onClick} actionLabel="go to Quizzes" />);
    const button = screen.getByRole('button', { name: 'Meducation, go to Quizzes' });
    expect(screen.queryByText(brand.name)).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('requires a spoken action description for clickable brands', () => {
    expect(() => render(<AppBrand onClick={() => undefined} />)).toThrow('requires an actionLabel');
  });
});
