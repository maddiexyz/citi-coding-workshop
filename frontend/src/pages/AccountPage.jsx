import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useAuth from '../auth/useAuth';
import { ROLE_LABELS } from '../auth/permissions';
import { changePassword } from '../services/authApi';
import validatePasswordChange from '../utils/passwordValidation';

const EMPTY = { current: '', next: '', confirm: '' };

/** The signed-in user's account: who they are, and changing their password. */
export default function AccountPage() {
  const { user } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const field = (name) => ({
    value: values[name],
    onChange: (event) => {
      setValues((current) => ({ ...current, [name]: event.target.value }));
      setErrors((current) => ({ ...current, [name]: undefined }));
      setDone(false);
    },
    error: Boolean(errors[name]),
    helperText: errors[name],
    disabled: saving,
    fullWidth: true,
    type: 'password',
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validatePasswordChange(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      await changePassword(values.current, values.next);
      setValues(EMPTY);
      setDone(true);
    } catch (err) {
      setErrors({ current: err.details?.current_password, next: err.details?.new_password });
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Typography variant="h4" component="h1">Account</Typography>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2">{user.full_name}</Typography>
        <Typography color="text.secondary">{user.email} · {ROLE_LABELS[user.role] ?? user.role}</Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2" gutterBottom>Change password</Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2.5}>
            {done && <Alert severity="success">Password changed. You stay signed in here; other devices were signed out.</Alert>}
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Current password" autoComplete="current-password" required {...field('current')} />
            <TextField
              label="New password"
              autoComplete="new-password"
              required
              {...field('next')}
              helperText={errors.next ?? 'At least 10 characters'}
            />
            <TextField label="Repeat new password" autoComplete="new-password" required {...field('confirm')} />
            <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : 'Change password'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}
