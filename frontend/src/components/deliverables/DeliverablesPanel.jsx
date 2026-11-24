import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import useAuth from '../../auth/useAuth';
import { canDeleteDeliverables, canEditDeliverables, canUpdateDeliverableProgress } from '../../auth/permissions';
import { deleteDeliverable, listDeliverables } from '../../services/deliverablesApi';
import { criticalIds, getForecast } from '../../services/forecastApi';
import { listResources } from '../../services/resourcesApi';
import useDebouncedValue from '../../utils/useDebouncedValue';
import ConfirmDialog from '../ConfirmDialog';
import projectShape from '../projectPropTypes';
import ChainView from './ChainView';
import DeliverableFilters from './DeliverableFilters';
import DeliverableFormDialog from './DeliverableFormDialog';
import DeliverableList from './DeliverableList';

const NO_FILTERS = { search: '', status: '', assignee: '', blocked: false, overdue: false };

/** The Deliverables tab of a project: filters, list, create/edit dialog and delete. */
export default function DeliverablesPanel({ project, onChanged }) {
  const { user } = useAuth();
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const canEdit = canEditDeliverables(user, project);
  const canDelete = canDeleteDeliverables(user, project);

  const [filters, setFilters] = useState(NO_FILTERS);
  const search = useDebouncedValue(filters.search.trim());
  const [all, setAll] = useState([]);
  const [people, setPeople] = useState([]);
  const [result, setResult] = useState({ key: null, items: [], error: null });
  const [actionError, setActionError] = useState(null);
  const [dialog, setDialog] = useState(null); // {id: number|null}
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState('list');
  const [critical, setCritical] = useState(() => new Set());

  const filtered = Boolean(search || filters.status || filters.assignee || filters.blocked || filters.overdue);
  // The list is loading while the shown result belongs to an older request
  const requestKey = JSON.stringify([project.id, search, filters.status, filters.assignee, filters.blocked, filters.overdue, reloadKey]);
  const loading = result.key !== requestKey;

  // A newer request cancels an older one, so slow responses never win
  useEffect(() => {
    let cancelled = false;
    listDeliverables({
      project_id: project.id,
      q: search,
      status: filters.status,
      assignee: filters.assignee,
      blocked: filters.blocked || undefined,
      overdue: filters.overdue || undefined,
    })
      .then((items) => !cancelled && setResult({ key: requestKey, items, error: null }))
      .catch((err) => !cancelled && setResult({ key: requestKey, items: [], error: err.message }));
    return () => { cancelled = true; };
  }, [requestKey, project.id, search, filters.status, filters.assignee, filters.blocked, filters.overdue]);

  // Active people, for the assignee picker and filter
  useEffect(() => {
    let cancelled = false;
    listResources({ active: true })
      .then((data) => !cancelled && setPeople(data.items))
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Every deliverable of the project, for the dependency picker
  useEffect(() => {
    let cancelled = false;
    listDeliverables({ project_id: project.id })
      .then((result) => !cancelled && setAll(result))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id, reloadKey]);

  // Which deliverables are on the forecast's critical path (a missing forecast just means no chips)
  useEffect(() => {
    let cancelled = false;
    getForecast(project.id)
      .then((forecast) => !cancelled && setCritical(criticalIds(forecast)))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id, reloadKey]);

  const openDeliverable = (item) => setDialog({ id: item.id, statusOnly: !canEdit && canUpdateDeliverableProgress(user, item) });

  const changed = (saved, verb) => {
    if (verb) setMessage(`${verb} ${saved.title}`);
    setReloadKey((key) => key + 1);
    onChanged();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDeliverable(toDelete.id);
      setMessage(`Deleted ${toDelete.title}`);
      changed(toDelete, null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setToDelete(null);
      setDeleting(false);
    }
  };

  let content;
  if (loading) {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading deliverables" />
      </Box>
    );
  } else if (result.items.length === 0 && !result.error) {
    content = (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        {filtered ? 'No deliverables match these filters.' : 'No deliverables yet.'}
      </Typography>
    );
  } else {
    content = (
      <DeliverableList
        deliverables={result.items}
        isDesktop={isDesktop}
        canDelete={canDelete}
        onOpen={openDeliverable}
        onDelete={setToDelete}
        criticalIds={critical}
      />
    );
  }

  const links = toDelete ? (toDelete.predecessor_count ?? 0) + (toDelete.successor_count ?? 0) : 0;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2">Deliverables</Typography>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ id: null })}>
            New deliverable
          </Button>
        )}
      </Stack>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        onChange={(_, value) => value && setView(value)}
        aria-label="Deliverables view"
        sx={{ alignSelf: 'flex-start' }}
      >
        <ToggleButton value="list">List</ToggleButton>
        <ToggleButton value="chain">Chain</ToggleButton>
      </ToggleButtonGroup>
      {view === 'list' && <DeliverableFilters filters={filters} people={people} onChange={setFilters} />}
      {result.error && <Alert severity="error">{result.error}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {view === 'list' ? content : <ChainView projectId={project.id} reloadKey={reloadKey} onOpen={openDeliverable} criticalIds={critical} />}

      {dialog && (
        <DeliverableFormDialog
          key={dialog.id ?? 'new'}
          open
          projectId={project.id}
          deliverableId={dialog.id}
          readOnly={!canEdit && !dialog.statusOnly}
          statusOnly={Boolean(dialog.statusOnly)}
          projectDeliverables={all}
          people={people}
          onClose={() => setDialog(null)}
          onChanged={changed}
        />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete deliverable?"
        message={toDelete
          ? `"${toDelete.title}" will be permanently deleted${links ? `, with its ${links} dependency link(s)` : ''}.`
          : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}

DeliverablesPanel.propTypes = {
  project: projectShape.isRequired,
  onChanged: PropTypes.func.isRequired,
};
