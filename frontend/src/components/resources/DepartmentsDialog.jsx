import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  createDepartment, deleteDepartment, listDepartments, renameDepartment,
} from '../../services/departmentsApi';

/** Admin: add, rename and delete departments. Calls onChanged after any change. */
export default function DepartmentsDialog({ onClose, onChanged }) {
  const [departments, setDepartments] = useState(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // {id, name}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listDepartments()
      .then((items) => !cancelled && setDepartments(items))
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [reloadKey]);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setReloadKey((k) => k + 1);
      onChanged();
      return true;
    } catch (err) {
      setError(err.details?.name ?? err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (await run(() => createDepartment(name.trim()))) setName('');
  };
  const saveRename = async () => {
    if (await run(() => renameDepartment(editing.id, editing.name.trim()))) setEditing(null);
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Departments</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={add} noValidate>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mt: 1 }}>
            <TextField label="New department" value={name} onChange={(e) => setName(e.target.value)} size="small" fullWidth disabled={busy} />
            <Button type="submit" variant="contained" disabled={busy || !name.trim()}>Add</Button>
          </Stack>
        </Box>
        <List aria-label="Departments" dense>
          {(departments ?? []).map((d) => (
            <ListItem
              key={d.id}
              divider
              secondaryAction={editing?.id === d.id ? (
                <Tooltip title="Save"><IconButton edge="end" aria-label={`Save ${d.name}`} onClick={saveRename} disabled={busy}><CheckIcon /></IconButton></Tooltip>
              ) : (
                <>
                  <Tooltip title="Rename"><IconButton aria-label={`Rename ${d.name}`} onClick={() => setEditing({ id: d.id, name: d.name })} disabled={busy}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton edge="end" color="error" aria-label={`Delete ${d.name}`} onClick={() => run(() => deleteDepartment(d.id))} disabled={busy}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </>
              )}
            >
              {editing?.id === d.id ? (
                <TextField
                  label="Name"
                  size="small"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  sx={{ mr: 6 }}
                  autoFocus
                />
              ) : (
                <ListItemText primary={d.name} secondary={`${d.resource_count} people · ${d.project_count} projects`} />
              )}
            </ListItem>
          ))}
          {departments?.length === 0 && <ListItem><ListItemText secondary="No departments yet." /></ListItem>}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Close</Button></DialogActions>
    </Dialog>
  );
}

DepartmentsDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
};
