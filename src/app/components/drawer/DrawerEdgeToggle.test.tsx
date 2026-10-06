import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/theme';
import { DrawerEdgeToggle } from './DrawerEdgeToggle';
import { DrawerSurface } from './DrawerSurface';

describe('DrawerEdgeToggle', () => {
  it('exposes one labelled button controlling the drawer and calls its callback once', () => {
    const onToggle = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <DrawerSurface edgeToggle={<DrawerEdgeToggle expanded onToggle={onToggle} controlsId="drawer-content" />}>
          <nav id="drawer-content">Drawer content</nav>
        </DrawerSurface>
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'drawer-content');
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(button.querySelector('.MuiTouchRipple-root')).toBeNull();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('labels the collapsed state and disables interaction when requested', () => {
    const onToggle = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <DrawerEdgeToggle expanded={false} onToggle={onToggle} disabled controlsId="items" />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button', { name: 'Expand navigation' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
