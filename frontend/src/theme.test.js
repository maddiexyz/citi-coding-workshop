import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import theme from './theme';

describe('theme', () => {
  it.each(['primary', 'secondary', 'error', 'warning', 'success'])(
    '%s keeps its contrast text at WCAG AA (4.5:1)',
    (name) => {
      const { main, contrastText } = theme.palette[name];
      expect(getContrastRatio(main, contrastText)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
