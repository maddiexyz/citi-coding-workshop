import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import useAuth from '../auth/useAuth';
import useYou from '../auth/useYou';
import { canManageDepartments, canManageResources } from '../auth/permissions';
import ConfirmDialog from '../components/ConfirmDialog';
import OverAllocatedChip from '../components/resources/OverAllocatedChip';
import DepartmentsDialog from '../components/resources/DepartmentsDialog';
import ResourceFormDialog from '../components/resources/ResourceFormDialog';
import resourceShape from '../components/resources/resourcePropTypes';
import { listDepartments } from '../services/departmentsApi';
import { deleteResource, listResources } from '../services/resourcesApi';
import { formatDate, formatHours } from '../utils/format';
import groupByDepartment from '../utils/groupByDepartment';
import useDebouncedValue from '../utils/useDebouncedValue';

function Load({ resource }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <span>{formatHours(resource.week_hours)} / {formatHours(resource.weekly_hours)}</span>
      {resource.over_allocated && <OverAllocatedChip />}
    </Stack>
  );
}

Load.propTypes = { resource: resourceShape.isRequired };

function Actions({ resource, onEdit, onDelete }) {
  return (
    <>
      <Tooltip title="Edit">
        <IconButton aria-label={`Edit ${resource.full_name}`} onClick={() => onEdit(resource)}><EditIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton color="error" aria-label={`Delete ${resource.full_name}`} onClick={() => onDelete(resource)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

Actions.propTypes = { resource: resourceShape.isRequired, onEdit: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired };

/** People, their weekly capacity and this week's load; admins manage them. */
export default function ResourcesPage() {
  const { user } = useAuth();
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const canManage = canManageResources(user);
  const you = useYou();

  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const [active, setActive] = useState('true');
  const [overOnly, setOverOnly] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [managingDepartments, setManagingDepartments] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, items: [], week: null, error: null });
  const [dialog, setDialog] = useState(null); // {resource|null}
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);

  const requestKey = JSON.stringify([q, active, overOnly, departmentId, reloadKey]);
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    listResources({ q, active, over_allocated: overOnly || undefined, department_id: departmentId })
      .then((data) => !cancelled && setResult({ key: requestKey, items: data.items, week: data.week_start, error: null }))
      .catch((err) => !cancelled && setResult({ key: requestKey, items: [], week: null, error: err.message }));
    return () => { cancelled = true; };
  }, [requestKey, q, active, overOnly, departmentId]);

  useEffect(() => {
    let cancelled = false;
    listDepartments().then((items) => !cancelled && setDepartments(items)).catch(() => {});
    return () => { cancelled = true; };
  }, [reloadKey]);

  const saved = (resource, verb) => {
    setDialog(null);
    setMessage(`${verb} ${resource.full_name}`);
    setReloadKey((key) => key + 1);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteResource(toDelete.id);
      setMessage(`Deleted ${toDelete.full_name}`);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  const nameLink = (r) => <Link component={RouterLink} to={`/resources/${r.id}`}>{you.resource(r.id, r.full_name)}</Link>;
  const inactive = (r) => !r.is_active && <Chip size="small" variant="outlined" label="Inactive" />;

  const renderPeople = (items, label) => (isDesktop ? (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Department</TableCell>
            <TableCell>This week</TableCell>
            <TableCell />
            {canManage && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id} hover>
              <TableCell sx={{ fontWeight: 600 }}>{nameLink(r)}</TableCell>
              <TableCell>{r.title ?? '—'}</TableCell>
              <TableCell>{r.department_name ?? '—'}</TableCell>
              <TableCell><Load resource={r} /></TableCell>
              <TableCell>{inactive(r)}</TableCell>
              {canManage && (
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Actions resource={r} onEdit={(res) => setDialog({ resource: res })} onDelete={setToDelete} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  ) : (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label={label}>
      {items.map((r) => (
        <Card key={r.id} variant="outlined" component="li">
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>{nameLink(r)}</Typography>
              {inactive(r)}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {[r.title, r.department_name].filter(Boolean).join(' · ') || '—'}
            </Typography>
            <Load resource={r} />
            {canManage && (
              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                <Actions resource={r} onEdit={(res) => setDialog({ resource: res })} onDelete={setToDelete} />
              </Stack>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  ));

  let content;
  if (loading) {
    content = <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading people" /></Box>;
  } else if (result.error) {
    content = null;
  } else if (result.items.length === 0) {
    content = (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        {q || overOnly || departmentId || active !== 'true' ? 'No people match these filters.' : 'No people yet.'}
      </Typography>
    );
  } else if (grouped) {
    content = (
      <Stack spacing={3}>
        {groupByDepartment(result.items).map((group) => (
          <Box component="section" key={group.name} aria-label={group.name}>
            <Typography variant="h6" component="h2">{group.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {group.people.length} {group.people.length === 1 ? 'person' : 'people'}
              {' · '}
              {formatHours(group.allocated)} allocated of {formatHours(group.capacity)} capacity this week
              {' · '}
              {group.over} over-allocated
            </Typography>
            {renderPeople(group.people, `People in ${group.name}`)}
          </Box>
        ))}
      </Stack>
    );
  } else {
    content = renderPeople(result.items, 'People');
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1">People</Typography>
          {result.week && <Typography variant="body2" color="text.secondary">Load shown for the week of {formatDate(result.week)}</Typography>}
        </Box>
        <Stack direction="row" spacing={1}>
          {canManageDepartments(user) && (
            <Button variant="outlined" onClick={() => setManagingDepartments(true)}>Departments</Button>
          )}
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ resource: null })}>New person</Button>
          )}
        </Stack>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField
          label="Search people"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          size="small"
          sx={{ flexGrow: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <TextField select label="Status" value={active} onChange={(event) => setActive(event.target.value)} size="small" sx={{ minWidth: 150 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
          <MenuItem value="">Everyone</MenuItem>
        </TextField>
        <TextField select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} size="small" sx={{ minWidth: 170 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
          <MenuItem value="">All departments</MenuItem>
          {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={overOnly} onChange={(event) => setOverOnly(event.target.checked)} />} label="Over-allocated this week" />
        <FormControlLabel control={<Switch checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />} label="Group by department" />
      </Stack>
      {result.error && <Alert severity="error">{result.error}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {content}

      {managingDepartments && (
        <DepartmentsDialog onClose={() => setManagingDepartments(false)} onChanged={() => setReloadKey((key) => key + 1)} />
      )}
      {dialog && (
        <ResourceFormDialog resource={dialog.resource} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete person?"
        message={toDelete ? `${toDelete.full_name} will be permanently deleted. People with allocations can't be deleted: set them inactive instead.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
