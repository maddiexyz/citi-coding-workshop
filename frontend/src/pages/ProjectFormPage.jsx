import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useAuth from '../auth/useAuth';
import { canChangeProject, canCreateProject } from '../auth/permissions';
import { PROJECT_STATUSES } from '../constants/projectStatus';
import { createProject, getProject, updateProject } from '../services/projectsApi';
import { listUsers } from '../services/usersApi';
import validateProject from '../utils/projectValidation';

const EMPTY_FORM = {
  code: '', name: '', description: '', status: 'planned', start_date: '', end_date: '', team_lead_id: '',
  budget_planned: '',
};

/** Convert an API project into form values (nulls become empty strings). */
function toFormValues(project) {
  return Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, project[key] ?? '']));
}

/** Create or edit a project. Used for /projects/new and /projects/:id/edit. */
export default function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_FORM);
  const [project, setProject] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [teamLeads, setTeamLeads] = useState([]);

  // Active team leads for the picker (only admins and project managers reach this form)
  useEffect(() => {
    let cancelled = false;
    listUsers({ role: 'team_lead', active: true })
      .then((items) => !cancelled && setTeamLeads(items))
      .catch(() => {}); // the picker just stays empty; saving still works
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    getProject(id)
      .then((loaded) => {
        setProject(loaded);
        setValues(toFormValues(loaded));
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading" /></Box>;
  }
  if (isEdit && !project) {
    return <Alert severity="error">{formError ?? 'Project not found'}</Alert>;
  }
  const allowed = isEdit ? canChangeProject(user, project) : canCreateProject(user);
  if (!allowed) {
    return (
      <Alert severity="warning" action={<Button component={RouterLink} to="/projects">Back</Button>}>
        You don&apos;t have permission to {isEdit ? 'edit this project' : 'create projects'}.
      </Alert>
    );
  }

  const setField = (name) => (event) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const clientErrors = validateProject(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    setFormError(null);
    const payload = {
      ...values,
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      description: values.description.trim() || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      team_lead_id: values.team_lead_id === '' ? null : Number(values.team_lead_id),
      // Kept as a string so the amount is never rounded as a float
      budget_planned: String(values.budget_planned).trim() || null,
    };
    try {
      const saved = isEdit ? await updateProject(id, payload) : await createProject(payload);
      navigate('/projects', { state: { notice: `${isEdit ? 'Updated' : 'Created'} ${saved.code}` } });
    } catch (err) {
      // Show the backend's per-field messages next to the fields
      setErrors(err.details ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  const fieldProps = (name) => ({
    value: values[name],
    onChange: setField(name),
    error: Boolean(errors[name]),
    helperText: errors[name],
    disabled: saving,
    fullWidth: true,
  });

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 }, maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" component="h1" gutterBottom>
        {isEdit ? `Edit ${project.code}` : 'New project'}
      </Typography>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={2.5} sx={{ mt: 2 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Code" required {...fieldProps('code')} sx={{ maxWidth: { sm: 200 } }} />
            <TextField label="Name" required {...fieldProps('name')} />
          </Stack>
          <TextField label="Description" multiline minRows={3} {...fieldProps('description')} />
          <TextField label="Status" select {...fieldProps('status')}>
            {PROJECT_STATUSES.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Team lead"
            select
            {...fieldProps('team_lead_id')}
            helperText={errors.team_lead_id ?? 'Can add and edit deliverables in this project'}
          >
            <MenuItem value="">Not assigned</MenuItem>
            {/* Keep the current lead selectable even if they are no longer active */}
            {project?.team_lead_id && !teamLeads.some((u) => u.id === project.team_lead_id) && (
              <MenuItem value={project.team_lead_id}>{project.team_lead_name}</MenuItem>
            )}
            {teamLeads.map((lead) => <MenuItem key={lead.id} value={lead.id}>{lead.full_name}</MenuItem>)}
          </TextField>
          <TextField
            label="Planned budget"
            inputMode="decimal"
            {...fieldProps('budget_planned')}
            helperText={errors.budget_planned ?? 'The approved budget; leave empty if none is set yet'}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Start date" type="date" {...fieldProps('start_date')} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="End date" type="date" {...fieldProps('end_date')} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
            <Button component={RouterLink} to="/projects" disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Save project'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}
