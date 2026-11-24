import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import theme from './theme';

const COLOURS = ['primary', 'secondary', 'error', 'warning', 'success'];

describe.each(['light', 'dark'])('%s scheme', (scheme) => {
  const { palette } = theme.colorSchemes[scheme];

  it.each(COLOURS)('%s keeps its contrast text at WCAG AA (4.5:1)', (name) => {
    expect(getContrastRatio(palette[name].main, palette[name].contrastText)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COLOURS)('%s is readable as text or a link on the page background', (name) => {
    expect(getContrastRatio(palette[name].main, palette.background.default)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(palette[name].main, palette.background.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps body and secondary text readable', () => {
    expect(getContrastRatio(palette.text.primary, palette.background.default)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(palette.text.secondary, palette.background.paper)).toBeGreaterThanOrEqual(4.5);
  });
});
