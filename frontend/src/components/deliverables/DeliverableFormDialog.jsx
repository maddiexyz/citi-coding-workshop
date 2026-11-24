import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMediaQuery } from 'react-responsive';
import { DELIVERABLE_STATUSES } from '../../constants/deliverableStatus';
import { createDeliverable, getDeliverable, updateDeliverable } from '../../services/deliverablesApi';
import validateDeliverable from '../../utils/deliverableValidation';
import DependencyEditor from './DependencyEditor';
import DeliverableFlags from './DeliverableFlags';
import { deliverableSummaryShape } from './deliverablePropTypes';

const EMPTY = { title: '', description: '', status: 'not_started', due_date: '', assignee_resource_id: '' };

function toFormValues(deliverable) {
  return Object.fromEntries(Object.keys(EMPTY).map((key) => [key, deliverable[key] ?? '']));
}

/**
 * Create, edit or view a deliverable. With a deliverableId it loads the
 * deliverable and shows its dependencies; readOnly shows everything disabled.
 * onChanged is called after any save (including dependency changes).
 */
export default function DeliverableFormDialog({
  open, projectId, deliverableId = null, readOnly = false, projectDeliverables, people = [], onClose, onChanged,
}) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const isEdit = deliverableId !== null;
  const [deliverable, setDeliverable] = useState(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !isEdit) return undefined;
    let cancelled = false;
    getDeliverable(deliverableId)
      .then((loaded) => {
        if (cancelled) return;
        setDeliverable(loaded);
        setValues(toFormValues(loaded));
      })
      .catch((err) => !cancelled && setFormError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, isEdit, deliverableId]);

  const setField = (name) => (event) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateDeliverable(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      status: values.status,
      due_date: values.due_date || null,
      assignee_resource_id: values.assignee_resource_id === '' ? null : Number(values.assignee_resource_id),
    };
    try {
      const saved = isEdit
        ? await updateDeliverable(deliverableId, payload)
        : await createDeliverable({ ...payload, project_id: projectId });
      onChanged(saved, isEdit ? 'Updated' : 'Created');
      onClose();
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  const dependencyChanged = (updated) => {
    setDeliverable(updated);
    onChanged(updated, null);
  };

  const fieldProps = (name) => ({
    value: values[name],
    onChange: setField(name),
    error: Boolean(errors[name]),
    helperText: errors[name],
    disabled: saving || readOnly,
    fullWidth: true,
  });

  let title = 'New deliverable';
  if (isEdit) title = readOnly ? 'Deliverable' : 'Edit deliverable';

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress aria-label="Loading deliverable" />
            </Box>
          ) : (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              {formError && <Alert severity="error">{formError}</Alert>}
              {deliverable && <DeliverableFlags isBlocked={deliverable.is_blocked} isOverdue={deliverable.is_overdue} />}
              <TextField label="Title" required autoFocus={!readOnly} {...fieldProps('title')} />
              <TextField label="Description" multiline minRows={2} {...fieldProps('description')} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Status" select {...fieldProps('status')}>
                  {DELIVERABLE_STATUSES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Due date" type="date" {...fieldProps('due_date')} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
              <TextField label="Assignee" select {...fieldProps('assignee_resource_id')}>
                <MenuItem value="">Unassigned</MenuItem>
                {/* Keep the current assignee selectable even if they are no longer active */}
                {deliverable?.assignee_resource_id && !people.some((p) => p.id === deliverable.assignee_resource_id) && (
                  <MenuItem value={deliverable.assignee_resource_id}>{deliverable.assignee_name}</MenuItem>
                )}
                {people.map((person) => <MenuItem key={person.id} value={person.id}>{person.full_name}</MenuItem>)}
              </TextField>
              {deliverable && (
                <>
                  <Divider />
                  <DependencyEditor
                    deliverable={deliverable}
                    options={projectDeliverables}
                    readOnly={readOnly}
                    onChange={dependencyChanged}
                  />
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && (
            <Button type="submit" variant="contained" disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

DeliverableFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  projectId: PropTypes.number.isRequired,
  deliverableId: PropTypes.number,
  readOnly: PropTypes.bool,
  projectDeliverables: PropTypes.arrayOf(deliverableSummaryShape).isRequired,
  people: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired, full_name: PropTypes.string.isRequired })),
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
};
