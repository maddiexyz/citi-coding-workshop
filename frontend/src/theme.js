import { alpha, createTheme } from '@mui/material/styles';

/**
 * App theme with light and dark colour schemes (MUI colorSchemes; the
 * user's choice is kept in localStorage under "mui-mode", default "system").
 *
 * Every palette colour keeps WCAG AA contrast (4.5:1) both for text drawn on
 * it (chips, buttons) and for itself as text or links on the page
 * background (see theme.test.js). contrastThreshold 4.5 (set per scheme: a
 * root palette would replace the light scheme) makes MUI pick a dark or light
 * contrastText that meets AA. Light mode uses deep tones on a faintly tinted
 * page so white cards stand out; dark mode uses light tints on deep navy.
 */
const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        contrastThreshold: 4.5,
        primary: { main: '#1d4ed8' },
        secondary: { main: '#0f766e' },
        warning: { main: '#b45309' },
        error: { main: '#c62828' },
        success: { main: '#2e7d32' },
        background: { default: '#f4f6fb', paper: '#ffffff' },
        text: { primary: '#0f172a', secondary: '#475569' },
        divider: 'rgba(15, 23, 42, 0.12)',
      },
    },
    dark: {
      palette: {
        contrastThreshold: 4.5,
        primary: { main: '#93c5fd' },
        secondary: { main: '#5eead4' },
        warning: { main: '#fbbf24' },
        error: { main: '#f87171' },
        success: { main: '#4ade80' },
        background: { default: '#0b1220', paper: '#111a2e' },
        text: { primary: '#e2e8f0', secondary: '#a3b1c6' },
        divider: 'rgba(226, 232, 240, 0.14)',
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, fontSize: '1.875rem', letterSpacing: '-0.02em', lineHeight: 1.2 },
    h5: { fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.015em', lineHeight: 1.25 },
    h6: { fontWeight: 650, fontSize: '1.125rem', letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 650, fontSize: '0.95rem', letterSpacing: '-0.005em' },
    caption: { letterSpacing: '0.01em' },
    overline: { fontWeight: 700, letterSpacing: '0.08em' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        outlined: ({ theme: t }) => ({
          borderColor: t.palette.divider,
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
          ...t.applyStyles('dark', { boxShadow: 'none' }),
        }),
      },
    },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        sizeSmall: { height: 24 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: ({ theme: t }) => ({
          fontWeight: 650,
          fontSize: '0.8rem',
          letterSpacing: '0.02em',
          color: t.palette.text.secondary,
          backgroundColor: alpha('#64748b', 0.06),
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&.MuiTableRow-hover:hover': { backgroundColor: alpha('#3b82f6', 0.06) } },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
});

/**
 * ThemeProvider settings shared by main.jsx and the tests. `noSsr`: this app
 * only renders in the browser, so the stored mode is applied from the first
 * render. Without it MUI first renders the default (light) scheme and
 * switches in an effect, so dark-mode users saw a light flash on every load
 * and colour transitions were still running when the page was checked.
 */
export const themeProviderProps = { defaultMode: 'system', noSsr: true };

export default theme;
