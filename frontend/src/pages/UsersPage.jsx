import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
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
import KeyIcon from '@mui/icons-material/Key';
import SearchIcon from '@mui/icons-material/Search';
import useAuth from '../auth/useAuth';
import useYou from '../auth/useYou';
import { ROLE_LABELS, canManageUsers } from '../auth/permissions';
import ConfirmDialog from '../components/ConfirmDialog';
import PasswordDialog from '../components/users/PasswordDialog';
import UserFormDialog from '../components/users/UserFormDialog';
import { deleteUser, listUsers } from '../services/usersApi';
import useDebouncedValue from '../utils/useDebouncedValue';

const userShape = PropTypes.shape({
  id: PropTypes.number.isRequired, email: PropTypes.string.isRequired, full_name: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired, is_active: PropTypes.bool.isRequired,
});

function Actions({ user, isSelf, onEdit, onPassword, onDelete }) {
  return (
    <>
      <Tooltip title="Edit"><IconButton aria-label={`Edit ${user.full_name}`} onClick={() => onEdit(user)}><EditIcon fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="Reset password"><IconButton aria-label={`Reset password for ${user.full_name}`} onClick={() => onPassword(user)}><KeyIcon fontSize="small" /></IconButton></Tooltip>
      {!isSelf && (
        <Tooltip title="Delete"><IconButton color="error" aria-label={`Delete ${user.full_name}`} onClick={() => onDelete(user)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      )}
    </>
  );
}

Actions.propTypes = {
  user: userShape.isRequired, isSelf: PropTypes.bool.isRequired,
  onEdit: PropTypes.func.isRequired, onPassword: PropTypes.func.isRequired, onDelete: PropTypes.func.isRequired,
};

/** Admin-only: sign-in accounts, their roles and whether they can sign in. */
export default function UsersPage() {
  const { user: me } = useAuth();
  const you = useYou();
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, items: [], error: null });
  const [dialog, setDialog] = useState(null); // {user|null}
  const [passwordFor, setPasswordFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);
  const allowed = canManageUsers(me);
  const requestKey = JSON.stringify([q, role, active, reloadKey]);

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    listUsers({ q, role, active })
      .then((items) => !cancelled && setResult({ key: requestKey, items, error: null }))
      .catch((err) => !cancelled && setResult({ key: requestKey, items: [], error: err.message }));
    return () => { cancelled = true; };
  }, [allowed, requestKey, q, role, active]);

  if (!allowed) return <Alert severity="warning">Only admins can manage users.</Alert>;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteUser(toDelete.id);
      setMessage(`Deleted ${toDelete.full_name}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  const actions = (u) => (
    <Actions user={u} isSelf={u.id === me.id} onEdit={(x) => setDialog({ user: x })} onPassword={setPasswordFor} onDelete={setToDelete} />
  );
  const status = (u) => (u.is_active ? null : <Chip size="small" variant="outlined" label="Inactive" />);

  let content;
  if (result.key !== requestKey) {
    content = <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading users" /></Box>;
  } else if (result.error) {
    content = <Alert severity="error">{result.error}</Alert>;
  } else if (result.items.length === 0) {
    content = <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>No users match these filters.</Typography>;
  } else if (isDesktop) {
    content = (
      <TableContainer component={Paper} variant="outlined">
        <Table aria-label="Users">
          <TableHead>
            <TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell /><TableCell align="right">Actions</TableCell></TableRow>
          </TableHead>
          <TableBody>
            {result.items.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{you.user(u.id, u.full_name)}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                <TableCell>{status(u)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{actions(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  } else {
    content = (
      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Users">
        {result.items.map((u) => (
          <Card key={u.id} variant="outlined" component="li">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 600 }}>{you.user(u.id, u.full_name)}</Typography>
                {status(u)}
              </Stack>
              <Typography variant="body2" color="text.secondary">{u.email} · {ROLE_LABELS[u.role] ?? u.role}</Typography>
              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>{actions(u)}</Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">Users</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ user: null })}>New user</Button>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} size="small" sx={{ flexGrow: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value)} size="small" sx={{ minWidth: 170 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
          <MenuItem value="">All roles</MenuItem>
          {Object.entries(ROLE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField select label="Status" value={active} onChange={(e) => setActive(e.target.value)} size="small" sx={{ minWidth: 140 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
          <MenuItem value="">Everyone</MenuItem>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
        </TextField>
      </Stack>
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {content}
      {dialog && (
        <UserFormDialog
          user={dialog.user}
          isSelf={dialog.user?.id === me.id}
          onClose={() => setDialog(null)}
          onSaved={(saved, verb) => { setDialog(null); setMessage(`${verb} ${saved.full_name}`); setReloadKey((k) => k + 1); }}
        />
      )}
      {passwordFor && (
        <PasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)}
          onSaved={(u) => { setPasswordFor(null); setMessage(`Password reset for ${u.full_name}`); }} />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete user?"
        message={toDelete ? `${toDelete.full_name} (${toDelete.email}) will be deleted. Users who own projects can't be deleted: deactivate them instead.` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
