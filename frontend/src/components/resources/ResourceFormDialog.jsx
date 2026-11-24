import { useEffect, useState } from 'react';
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
import { createResource, updateResource } from '../../services/resourcesApi';
import { listUsers } from '../../services/usersApi';
import validateResource from '../../utils/resourceValidation';

const EMPTY = { full_name: '', email: '', department: '', title: '', weekly_hours: '40', user_id: '', is_active: true };

function toFormValues(resource) {
  if (!resource) return EMPTY;
  return Object.fromEntries(Object.entries(EMPTY).map(([key, empty]) => [key, resource[key] ?? empty]));
}

/** Create or edit a resource (admin only). */
export default function ResourceFormDialog({ resource = null, onClose, onSaved }) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [values, setValues] = useState(() => toFormValues(resource));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listUsers({ active: true }).then((items) => !cancelled && setUsers(items)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setField = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateResource(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    setFormError(null);
    const payload = {
      full_name: values.full_name.trim(),
      email: values.email.trim() || null,
      department: values.department.trim() || null,
      title: values.title.trim() || null,
      weekly_hours: values.weekly_hours,
      user_id: values.user_id === '' ? null : Number(values.user_id),
      is_active: values.is_active,
    };
    try {
      const saved = resource ? await updateResource(resource.id, payload) : await createResource(payload);
      onSaved(saved, resource ? 'Updated' : 'Created');
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  const fieldProps = (name) => ({
    value: values[name], onChange: setField(name), error: Boolean(errors[name]),
    helperText: errors[name], disabled: saving, fullWidth: true,
  });

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{resource ? 'Edit person' : 'New person'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" required autoFocus {...fieldProps('full_name')} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Title" {...fieldProps('title')} />
              <TextField label="Department" {...fieldProps('department')} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Email" type="email" {...fieldProps('email')} />
              <TextField
                label="Weekly hours"
                required
                type="number"
                {...fieldProps('weekly_hours')}
                helperText={errors.weekly_hours ?? 'Capacity per week (max 60)'}
                slotProps={{ htmlInput: { min: 0.5, max: 60, step: 0.5 } }}
              />
            </Stack>
            <TextField label="Linked user account" select {...fieldProps('user_id')}
              helperText={errors.user_id ?? 'Optional: the sign-in account of this person'}>
              <MenuItem value="">None</MenuItem>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.full_name} ({u.email})</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={values.is_active} onChange={setField('is_active')} disabled={saving} />}
              label="Active (can be allocated)"
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

ResourceFormDialog.propTypes = {
  resource: PropTypes.shape({ id: PropTypes.number.isRequired }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
