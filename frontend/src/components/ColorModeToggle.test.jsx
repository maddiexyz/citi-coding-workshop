import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import ColorModeToggle from './ColorModeToggle';
import theme from '../theme';

function renderToggle() {
  return render(<ThemeProvider theme={theme} defaultMode="system"><ColorModeToggle /></ThemeProvider>);
}

describe('ColorModeToggle', () => {
  it('starts on system and cycles light → dark → system', async () => {
    renderToggle();
    const button = screen.getByRole('button', { name: /Colour theme: System/ });
    expect(button).toHaveAccessibleName('Colour theme: System. Switch to light');
    await userEvent.click(button);
    expect(screen.getByRole('button')).toHaveAccessibleName('Colour theme: Light. Switch to dark');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAccessibleName('Colour theme: Dark. Switch to system');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAccessibleName('Colour theme: System. Switch to light');
  });

  it('remembers the choice across reloads', async () => {
    const { unmount } = renderToggle();
    await userEvent.click(screen.getByRole('button'));                     // system → light
    await userEvent.click(screen.getByRole('button'));                     // light → dark
    expect(localStorage.getItem('mui-mode')).toBe('dark');
    unmount();
    renderToggle();                                                        // a fresh page load
    expect(screen.getByRole('button')).toHaveAccessibleName('Colour theme: Dark. Switch to system');
  });
});
