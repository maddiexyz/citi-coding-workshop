import { createTheme } from '@mui/material/styles';

/**
 * App theme with light and dark colour schemes (MUI colorSchemes; the
 * user's choice is kept in localStorage under "mui-mode", default "system").
 *
 * Every palette colour keeps WCAG AA contrast (4.5:1) both for text drawn on
 * it (chips, buttons) and for itself as text or links on the page
 * background. contrastThreshold 4.5 (set per scheme: a root palette would
 * replace the light scheme) makes MUI pick a dark or light
 * contrastText that meets AA. MUI's default warning orange (#ed6c02) only
 * reaches 3.1:1 with white, hence the darker amber in light mode; dark mode
 * uses lighter tints with dark text.
 */
const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        contrastThreshold: 4.5,
        primary: { main: '#1f4e8c' },
        warning: { main: '#b45309' },
      },
    },
    dark: {
      palette: {
        contrastThreshold: 4.5,
        primary: { main: '#90caf9' },
        warning: { main: '#fbbf24' },
        error: { main: '#f87171' },
        success: { main: '#4ade80' },
        secondary: { main: '#ce93d8' },
      },
    },
  },
  shape: { borderRadius: 8 },
});

export default theme;
