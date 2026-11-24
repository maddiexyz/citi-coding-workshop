import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import useAuth from '../auth/useAuth';
import { canChangeProject, canCreateProject, canDeleteProject } from '../auth/permissions';
import { deleteProject, listProjects } from '../services/projectsApi';
import ConfirmDialog from '../components/ConfirmDialog';
import ProjectCardList from '../components/ProjectCardList';
import ProjectFilters from '../components/ProjectFilters';
import ProjectTable from '../components/ProjectTable';

const SEARCH_DELAY_MS = 300;

/** The "Mine" filter each role gets ("me" is resolved by the backend from the token). */
const MINE = {
  project_manager: { label: 'Owned by me', query: { owner: 'me' } },
  team_lead: { label: 'Led by me', query: { team_lead: 'me' } },
};

/** Spell out what deleting a project removes with it. */
function deleteMessage(project) {
  const parts = [
    [project.deliverable_count, 'deliverable', 'deliverables'],
    [project.allocation_count, 'allocation', 'allocations'],
    [project.budget_entry_count, 'spend entry', 'spend entries'],
  ].filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  const children = parts.length ? `, together with ${parts.join(', ')}` : '';
  return `${project.code} – ${project.name} will be permanently deleted${children}. To retire a project, set its status to completed or cancelled instead.`;
}

/** Projects list with search, status filter and role-aware actions. */
export default function ProjectsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery({ minWidth: 900 });

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const mineOption = MINE[user?.role] ?? null;
  const mine = Boolean(mineOption) && searchParams.get('mine') === '1';
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(location.state?.notice ?? null);
  const [reloadKey, setReloadKey] = useState(0);

  // Clear the one-time notice from navigation state so a refresh doesn't repeat it
  useEffect(() => {
    if (location.state?.notice) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  // Wait until the user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      if (next !== query) {
        setLoading(true);
        setQuery(next);
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, query]);

  // Fetch whenever the filters change (or after a delete bumps reloadKey).
  // A newer request cancels an older one, so slow responses never win.
  useEffect(() => {
    let cancelled = false;
    listProjects({ status, q: query, department_id: departmentId, ...(mine ? mineOption.query : {}) })
      .then((items) => {
        if (cancelled) return;
        setProjects(items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [status, query, departmentId, mine, mineOption, reloadKey]);

  const changeMine = (_, value) => {
    if (value === null) return;
    setLoading(true);
    setSearchParams(value === 'mine' ? { mine: '1' } : {}, { replace: true });
  };

  const changeStatus = (next) => {
    setLoading(true);
    setStatus(next);
  };

  const changeDepartment = (next) => {
    setLoading(true);
    setDepartmentId(next);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(toDelete.id);
      setMessage(`Deleted ${toDelete.code}`);
      setToDelete(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err.message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const canChange = (project) => canChangeProject(user, project);
  const canDelete = (project) => canDeleteProject(user, project);
  const List = isDesktop ? ProjectTable : ProjectCardList;

  let content;
  if (loading) {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading projects" />
      </Box>
    );
  } else if (projects.length === 0) {
    content = (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        {query || status || departmentId || mine ? 'No projects match these filters.' : 'No projects yet.'}
      </Typography>
    );
  } else {
    content = <List projects={projects} canChange={canChange} canDelete={canDelete} onDelete={setToDelete} />;
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">Projects</Typography>
        {canCreateProject(user) && (
          <Button component={RouterLink} to="/projects/new" variant="contained" startIcon={<AddIcon />}>
            New project
          </Button>
        )}
      </Stack>

      {mineOption && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mine ? 'mine' : 'all'}
          onChange={changeMine}
          aria-label="Which projects"
          sx={{ alignSelf: 'flex-start' }}
        >
          <ToggleButton value="all">All projects</ToggleButton>
          <ToggleButton value="mine">{mineOption.label}</ToggleButton>
        </ToggleButtonGroup>
      )}
      <ProjectFilters
        search={search}
        status={status}
        departmentId={departmentId}
        onSearchChange={setSearch}
        onStatusChange={changeStatus}
        onDepartmentChange={changeDepartment}
      />
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {content}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete project?"
        message={toDelete ? deleteMessage(toDelete) : ''}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar
        open={Boolean(message)}
        autoHideDuration={4000}
        onClose={() => setMessage(null)}
        message={message}
      />
    </Stack>
  );
}
