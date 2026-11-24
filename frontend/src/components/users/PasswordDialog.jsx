import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { resetPassword } from '../../services/usersApi';

/** Set a new password for a user; they are signed out everywhere. */
export default function PasswordDialog({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 10) {
      setError('Must be at least 10 characters');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(user.id, password);
      onSaved(user);
    } catch (err) {
      setError(err.details?.password ?? err.message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {user.full_name} will be signed out on every device and must use the new password.
          </DialogContentText>
          {error && !saving && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField label="New password" type="password" autoComplete="new-password" required autoFocus fullWidth
            value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} disabled={saving}
            helperText="At least 10 characters" />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

PasswordDialog.propTypes = {
  user: PropTypes.shape({ id: PropTypes.number.isRequired, full_name: PropTypes.string.isRequired }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
