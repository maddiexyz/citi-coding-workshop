import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import TimelineIcon from '@mui/icons-material/Timeline';
import homePath from '../auth/homePath';
import useAuth from '../auth/useAuth';
import ColorModeToggle from '../components/ColorModeToggle';

/** Sign-in form. After signing in, returns the user to the page they wanted. */
export default function LoginPage() {
  const { user, login, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from;
  const destination = (signedIn) => (from ? `${from.pathname}${from.search ?? ''}` : homePath(signedIn));
  if (user) return <Navigate to={destination(user)} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!email.trim()) errors.email = 'Email is required';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(email.trim(), password);
      navigate(destination(signedIn), { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={(theme) => ({
        minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, position: 'relative',
        bgcolor: 'background.default',
        // Soft glow behind the card, from the palette so it follows light and dark mode
        backgroundImage: `radial-gradient(60rem 30rem at 15% -10%, ${alpha(theme.palette.primary.main, 0.16)}, transparent 70%),
          radial-gradient(50rem 28rem at 110% 110%, ${alpha(theme.palette.secondary.main, 0.14)}, transparent 70%)`,
      })}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8, color: 'text.primary' }}><ColorModeToggle /></Box>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 3, sm: 4.5 }, width: '100%', maxWidth: 420, borderRadius: 3,
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
          '@media (prefers-reduced-motion: no-preference)': {
            animation: 'login-in 400ms ease-out both',
            '@keyframes login-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
          },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center',
              bgcolor: 'primary.main', color: 'primary.contrastText',
            }}
          >
            <TimelineIcon />
          </Box>
          <Typography variant="h5" component="h1">ACME Projects</Typography>
        </Stack>
        <Typography variant="subtitle1" component="p" sx={{ mb: 0.5 }}>
          Know where every project stands — and when it will finish.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in to view and manage projects.
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            {notice && !error && <Alert severity="info">{notice}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
              disabled={submitting}
              required
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password}
              disabled={submitting}
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
