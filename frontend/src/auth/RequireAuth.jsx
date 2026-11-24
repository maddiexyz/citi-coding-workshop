import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import useAuth from './useAuth';

/**
 * Route guard: renders its children only for signed-in users and sends
 * everyone else to /login, remembering where they were going.
 */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

RequireAuth.propTypes = {
  children: PropTypes.node.isRequired,
};
