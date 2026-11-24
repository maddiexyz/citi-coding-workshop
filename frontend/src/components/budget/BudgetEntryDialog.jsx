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
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { SPEND_CATEGORIES } from '../../constants/spendCategories';
import { createBudgetEntry, updateBudgetEntry } from '../../services/budgetApi';
import validateBudgetEntry from '../../utils/budgetEntryValidation';

/** Record or edit actual spend (admin and the owning PM). */
export default function BudgetEntryDialog({ projectId, currency, entry = null, onClose, onSaved }) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [values, setValues] = useState({
    category: entry?.category ?? 'labor',
    amount: entry?.amount ?? '',
    spent_on: entry?.spent_on ?? new Date().toISOString().slice(0, 10),
    description: entry?.description ?? '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const field = (name) => ({
    value: values[name],
    onChange: (event) => {
      setValues((current) => ({ ...current, [name]: event.target.value }));
      setErrors((current) => ({ ...current, [name]: undefined }));
    },
    error: Boolean(errors[name]), helperText: errors[name], disabled: saving, fullWidth: true,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateBudgetEntry(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    setFormError(null);
    // Amounts stay strings end to end so they are never rounded as floats
    const payload = { ...values, amount: values.amount.trim(), description: values.description.trim() || null };
    try {
      const saved = entry ? await updateBudgetEntry(entry.id, payload) : await createBudgetEntry({ ...payload, project_id: projectId });
      onSaved(saved, entry ? 'Updated' : 'Recorded');
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{entry ? 'Edit spend' : 'Record spend'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label={`Amount (${currency})`} required inputMode="decimal" autoFocus {...field('amount')} />
            <TextField label="Category" select {...field('category')}>
              {SPEND_CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
            </TextField>
            <TextField label="Date" type="date" required {...field('spent_on')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Description" {...field('description')} />
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

BudgetEntryDialog.propTypes = {
  projectId: PropTypes.number.isRequired,
  currency: PropTypes.string.isRequired,
  entry: PropTypes.shape({
    id: PropTypes.number.isRequired, category: PropTypes.string, amount: PropTypes.string,
    spent_on: PropTypes.string, description: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
