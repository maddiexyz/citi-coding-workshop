import { createTheme } from '@mui/material/styles';

/**
 * App theme. Every colour used as a chip or button background keeps white
 * text at WCAG AA contrast (4.5:1); MUI's default warning orange (#ed6c02)
 * only reaches 3.1:1, so warning is a darker amber.
 */
const theme = createTheme({
  palette: {
    primary: { main: '#1f4e8c' },
    warning: { main: '#b45309' },
  },
  shape: { borderRadius: 8 },
});

export default theme;
