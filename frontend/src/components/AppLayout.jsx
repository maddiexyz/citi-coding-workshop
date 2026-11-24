import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../auth/permissions';

/** Page frame for signed-in pages: top bar with the user and a sign-out button. */
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/projects"
            sx={{ color: 'inherit', textDecoration: 'none', flexGrow: 1 }}
          >
            ACME Projects
          </Typography>
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2">{user.full_name}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>{ROLE_LABELS[user.role] ?? user.role}</Typography>
          </Box>
          <Button color="inherit" variant="outlined" size="small" onClick={() => logout()}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
        {children}
      </Container>
    </>
  );
}

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
