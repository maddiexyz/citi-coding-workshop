import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../auth/permissions';
import homePath from '../auth/homePath';

/** Main sections; `roles` limits a link to those roles. */
const NAV_ITEMS = [
  { to: '/my-work', label: 'My work' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/projects', label: 'Projects' },
  { to: '/resources', label: 'People' },
  { to: '/users', label: 'Users', roles: ['admin'] },
];

/** Page frame for signed-in pages: top bar with navigation, the user and a sign-out button. */
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const links = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));
  const [menuAnchor, setMenuAnchor] = useState(null);
  const closeMenu = () => setMenuAnchor(null);
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: { xs: 1, sm: 2 }, flexWrap: 'wrap', py: { xs: 1, sm: 0 } }}>
          <Typography
            variant="h6"
            component={RouterLink}
            to={homePath(user)}
            sx={{ color: 'inherit', textDecoration: 'none', mr: { sm: 2 } }}
          >
            ACME Projects
          </Typography>
          <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 0.5, flexGrow: 1 }}>
            {links.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Button
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  color="inherit"
                  aria-current={active ? 'page' : undefined}
                  sx={{ borderBottom: 2, borderColor: active ? 'common.white' : 'transparent', borderRadius: 0 }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
          <Button
            color="inherit"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
            aria-controls={menuAnchor ? 'user-menu' : undefined}
            aria-label={`Account menu for ${user.full_name}`}
            sx={{ textTransform: 'none', textAlign: 'right', display: 'block', lineHeight: 1.2 }}
          >
            <Typography variant="body2" component="span" sx={{ display: 'block' }}>{user.full_name}</Typography>
            <Typography variant="caption" component="span" sx={{ opacity: 0.8 }}>{ROLE_LABELS[user.role] ?? user.role}</Typography>
          </Button>
          <Menu id="user-menu" anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
            <MenuItem component={RouterLink} to="/account" onClick={closeMenu}>Account</MenuItem>
            <MenuItem onClick={() => { closeMenu(); logout(); }}>Sign out</MenuItem>
          </Menu>
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
