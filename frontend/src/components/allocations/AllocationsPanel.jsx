import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import useAuth from '../../auth/useAuth';
import useYou from '../../auth/useYou';
import { canManageAllocations } from '../../auth/permissions';
import { deleteAllocation, listAllocations } from '../../services/allocationsApi';
import { listResources } from '../../services/resourcesApi';
import { formatDate, formatHours } from '../../utils/format';
import ConfirmDialog from '../ConfirmDialog';
import projectShape from '../projectPropTypes';
import OverAllocatedChip from '../resources/OverAllocatedChip';
import AllocationFormDialog from './AllocationFormDialog';
import overAllocationMessage from './overAllocationMessage';

/** The Allocations tab of a project: who works on it, how many hours a week, and over-allocation flags. */
export default function AllocationsPanel({ project }) {
  const { user } = useAuth();
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const canManage = canManageAllocations(user, project);
  const you = useYou();
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, items: [], over: new Set(), error: null });
  const [dialog, setDialog] = useState(null); // {allocation|null}
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [warning, setWarning] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);

  const requestKey = `${project.id}:${reloadKey}`;
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllocations({ project_id: project.id }), listResources({ over_allocated: true })])
      .then(([items, over]) => !cancelled && setResult({
        key: requestKey, items, over: new Set(over.items.map((r) => r.id)), error: null,
      }))
      .catch((err) => !cancelled && setResult({ key: requestKey, items: [], over: new Set(), error: err.message }));
    return () => { cancelled = true; };
  }, [project.id, requestKey]);

  const saved = (allocation) => {
    setDialog(null);
    if (allocation.warnings?.length) {
      setWarning(overAllocationMessage(allocation.resource_name, allocation.warnings));
    } else {
      setWarning(null);
      setMessage(`Saved allocation for ${allocation.resource_name}`);
    }
    setReloadKey((key) => key + 1);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAllocation(toDelete.id);
      setMessage(`Removed ${toDelete.resource_name} from this project`);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  const overNow = result.items.filter((a) => result.over.has(a.resource_id));
  const person = (a) => <Link component={RouterLink} to={`/resources/${a.resource_id}`}>{you.resource(a.resource_id, a.resource_name)}</Link>;
  const actions = (a) => canManage && (
    <>
      <Tooltip title="Edit"><IconButton aria-label={`Edit allocation for ${a.resource_name}`} onClick={() => setDialog({ allocation: a })}><EditIcon fontSize="small" /></IconButton></Tooltip>
      <Tooltip title="Remove"><IconButton color="error" aria-label={`Remove ${a.resource_name}`} onClick={() => setToDelete(a)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
    </>
  );

  let content;
  if (loading) {
    content = <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading allocations" /></Box>;
  } else if (result.error) {
    content = null;
  } else if (result.items.length === 0) {
    content = <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>Nobody is allocated to this project yet.</Typography>;
  } else if (isDesktop) {
    content = (
      <TableContainer component={Paper} variant="outlined">
        <Table aria-label="Allocations">
          <TableHead>
            <TableRow>
              <TableCell>Person</TableCell>
              <TableCell align="right">Hours / week</TableCell>
              <TableCell>From</TableCell>
              <TableCell>To</TableCell>
              <TableCell>Note</TableCell>
              <TableCell>This week</TableCell>
              {canManage && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {result.items.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{person(a)}</TableCell>
                <TableCell align="right">{formatHours(a.hours_per_week)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(a.start_date)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(a.end_date)}</TableCell>
                <TableCell>{a.note ?? '—'}</TableCell>
                <TableCell>{result.over.has(a.resource_id) ? <OverAllocatedChip /> : '—'}</TableCell>
                {canManage && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{actions(a)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  } else {
    content = (
      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Allocations">
        {result.items.map((a) => (
          <Card key={a.id} variant="outlined" component="li">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{person(a)}</Typography>
                {result.over.has(a.resource_id) && <OverAllocatedChip />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {formatHours(a.hours_per_week)} / week · {formatDate(a.start_date)} – {formatDate(a.end_date)}
              </Typography>
              {canManage && <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>{actions(a)}</Stack>}
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2">Allocations</Typography>
        {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ allocation: null })}>Allocate</Button>}
      </Stack>
      {warning && <Alert severity="warning" onClose={() => setWarning(null)}>{warning}</Alert>}
      {!loading && overNow.length > 0 && (
        <Alert severity="info">
          Over-allocated this week: {[...new Set(overNow.map((a) => you.resource(a.resource_id, a.resource_name)))].join(', ')}. Check their other projects.
        </Alert>
      )}
      {result.error && <Alert severity="error">{result.error}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {content}
      {dialog && <AllocationFormDialog project={project} allocation={dialog.allocation} onClose={() => setDialog(null)} onSaved={saved} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Remove allocation?"
        message={toDelete ? `${toDelete.resource_name} (${formatHours(toDelete.hours_per_week)} / week) will be removed from this project.` : ''}
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}

AllocationsPanel.propTypes = { project: projectShape.isRequired };
