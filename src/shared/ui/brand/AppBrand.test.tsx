import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { brand } from '../../brand';
import { AppBrand } from './AppBrand';

describe('AppBrand', () => {
  it('renders an accessible static full logo without a button', () => {
    render(<AppBrand />);
    expect(screen.getByRole('img', { name: brand.name })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses an accessible icon-only navigation label and invokes its action', () => {
    const onClick = vi.fn();
    render(<AppBrand variant="icon" onClick={onClick} actionLabel="go to Quizzes" />);
    const button = screen.getByRole('button', { name: 'Meducation, go to Quizzes' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('supports wordmark, stacked, monochrome, size, and root class options', () => {
    render(<AppBrand variant="wordmark" layout="stacked" size={210} colorMode="mono" className="brand-test" />);
    const logo = screen.getByRole('img', { name: brand.name });
    expect(logo).toHaveClass('brand-test');
    expect(logo).toHaveAttribute('data-brand-color', 'mono');
    expect(logo).toHaveAttribute('data-brand-layout', 'stacked');
    expect(logo.querySelector('svg')).toHaveAttribute('viewBox', '0 0 400 88');
  });

  it('requires a spoken action description for clickable brands', () => {
    expect(() => render(<AppBrand onClick={() => undefined} />)).toThrow('requires an actionLabel');
  });
});
