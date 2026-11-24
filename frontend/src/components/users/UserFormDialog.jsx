import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { ROLE_LABELS } from '../../auth/permissions';
import { createUser, updateUser } from '../../services/usersApi';
import validateUser from '../../utils/userValidation';

/**
 * Create a user (with an initial password) or edit one. For your own account
 * the role and active switch are locked, so an admin can't lock themselves out.
 */
export default function UserFormDialog({ user = null, isSelf = false, onClose, onSaved }) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [values, setValues] = useState({
    email: user?.email ?? '', full_name: user?.full_name ?? '', role: user?.role ?? 'viewer',
    is_active: user?.is_active ?? true, password: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateUser(values, { creating: !user });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    setFormError(null);
    const payload = { email: values.email.trim(), full_name: values.full_name.trim(), role: values.role, is_active: values.is_active };
    try {
      const saved = user ? await updateUser(user.id, payload) : await createUser({ ...payload, password: values.password });
      onSaved(saved, user ? 'Updated' : 'Created');
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  const field = (name) => ({
    value: values[name], onChange: set(name), error: Boolean(errors[name]), helperText: errors[name],
    disabled: saving, fullWidth: true,
  });

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{user ? `Edit ${user.full_name}` : 'New user'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" required autoFocus {...field('full_name')} />
            <TextField label="Email" type="email" required {...field('email')} />
            <TextField label="Role" select {...field('role')} disabled={saving || isSelf}
              helperText={errors.role ?? (isSelf ? 'You can’t change your own role' : null)}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            {!user && (
              <TextField label="Initial password" type="password" required autoComplete="new-password" {...field('password')}
                helperText={errors.password ?? 'At least 10 characters; share it securely'} />
            )}
            <FormControlLabel
              control={<Switch checked={values.is_active} onChange={set('is_active')} disabled={saving || isSelf} />}
              label={isSelf ? 'Active (you can’t deactivate yourself)' : 'Active (can sign in)'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

UserFormDialog.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired, email: PropTypes.string, full_name: PropTypes.string,
    role: PropTypes.string, is_active: PropTypes.bool,
  }),
  isSelf: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
