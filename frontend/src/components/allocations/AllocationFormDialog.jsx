import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { createAllocation, updateAllocation } from '../../services/allocationsApi';
import { listResources } from '../../services/resourcesApi';
import validateAllocation from '../../utils/allocationValidation';
import { formatHours } from '../../utils/format';
import projectShape from '../projectPropTypes';

/**
 * Create or edit an allocation on a project. Calls onSaved(allocation) with
 * the API result, which includes `warnings` when someone is now over-allocated.
 */
export default function AllocationFormDialog({ project, allocation = null, onClose, onSaved }) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [people, setPeople] = useState([]);
  const [values, setValues] = useState(() => ({
    resource_id: allocation?.resource_id ?? null,
    hours_per_week: allocation?.hours_per_week ?? '',
    start_date: allocation?.start_date ?? project.start_date ?? '',
    end_date: allocation?.end_date ?? project.end_date ?? '',
    note: allocation?.note ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listResources({ active: true }).then((data) => !cancelled && setPeople(data.items)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const set = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateAllocation(values, project);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    setFormError(null);
    const payload = { ...values, note: values.note.trim() || null };
    try {
      const saved = allocation
        ? await updateAllocation(allocation.id, payload)
        : await createAllocation({ ...payload, project_id: project.id });
      onSaved(saved);
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  const selected = people.find((p) => p.id === values.resource_id)
    ?? (allocation ? { id: allocation.resource_id, full_name: allocation.resource_name } : null);
  const field = (name) => ({
    value: values[name], onChange: (event) => set(name, event.target.value),
    error: Boolean(errors[name]), helperText: errors[name], disabled: saving, fullWidth: true,
  });

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{allocation ? 'Edit allocation' : 'Allocate a person'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <Autocomplete
              options={people}
              value={selected}
              onChange={(_, person) => set('resource_id', person?.id ?? null)}
              getOptionLabel={(person) => person.full_name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, person) => (
                <li {...props} key={person.id}>
                  {person.full_name} — {formatHours(person.week_hours)} of {formatHours(person.weekly_hours)} this week
                </li>
              )}
              disabled={saving}
              renderInput={(params) => (
                <TextField {...params} label="Person" required error={Boolean(errors.resource_id)} helperText={errors.resource_id} />
              )}
            />
            <TextField
              label="Hours per week"
              required
              type="number"
              {...field('hours_per_week')}
              helperText={errors.hours_per_week ?? 'Going over someone’s capacity is allowed but flagged'}
              slotProps={{ htmlInput: { min: 0.5, max: 80, step: 0.5 } }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Start" type="date" required {...field('start_date')} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="End" type="date" required {...field('end_date')} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField label="Note" {...field('note')} />
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

AllocationFormDialog.propTypes = {
  project: projectShape.isRequired,
  allocation: PropTypes.shape({
    id: PropTypes.number.isRequired,
    resource_id: PropTypes.number.isRequired,
    resource_name: PropTypes.string,
    hours_per_week: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    note: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
