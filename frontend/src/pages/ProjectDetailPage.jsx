import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import useAuth from '../auth/useAuth';
import { canChangeProject } from '../auth/permissions';
import ProjectStatusChip from '../components/ProjectStatusChip';
import DeliverablesPanel from '../components/deliverables/DeliverablesPanel';
import projectShape from '../components/projectPropTypes';
import { getProject } from '../services/projectsApi';
import { formatDate } from '../utils/format';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'deliverables', label: 'Deliverables' },
];

function Detail({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="dt">{label}</Typography>
      <Typography component="dd" sx={{ m: 0 }}>{children}</Typography>
    </Box>
  );
}

Detail.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/** Overview tab: key facts and deliverable progress. */
function Overview({ project }) {
  const total = project.deliverables_total ?? 0;
  const done = project.deliverables_done ?? 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <Stack spacing={3}>
      {project.description && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{project.description}</Typography>}
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, m: 0 }}>
        <Detail label="Owner">{project.owner_name}</Detail>
        <Detail label="Team lead">{project.team_lead_name ?? 'Not assigned'}</Detail>
        <Detail label="Start">{formatDate(project.start_date)}</Detail>
        <Detail label="End">{formatDate(project.end_date)}</Detail>
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h2" gutterBottom>Deliverables done</Typography>
        {total === 0 ? (
          <Typography color="text.secondary">No deliverables yet.</Typography>
        ) : (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <LinearProgress
              variant="determinate"
              value={percent}
              sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
              aria-label={`${done} of ${total} deliverables done`}
            />
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{done} / {total} ({percent}%)</Typography>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

Overview.propTypes = { project: projectShape.isRequired };

/** One project with tabs. The tab is kept in the URL (?tab=deliverables) so it survives a reload. */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === searchParams.get('tab')) ? searchParams.get('tab') : 'overview';

  const [state, setState] = useState({ key: null, project: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${id}:${reloadKey}`;

  useEffect(() => {
    let cancelled = false;
    getProject(id)
      .then((project) => !cancelled && setState({ key: requestKey, project, error: null }))
      .catch((err) => !cancelled && setState({ key: requestKey, project: null, error: err.message }));
    return () => { cancelled = true; };
  }, [id, requestKey]);

  const { project, error } = state;
  if (!project && state.key !== requestKey) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading project" /></Box>;
  }
  if (!project) {
    return (
      <Alert severity="error" action={<Button component={RouterLink} to="/projects">Back</Button>}>
        {error ?? 'Project not found'}
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Button component={RouterLink} to="/projects" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start' }}>
        Projects
      </Button>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 600 }}>{project.code}</Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="h4" component="h1">{project.name}</Typography>
            <ProjectStatusChip status={project.status} />
          </Stack>
        </Box>
        {canChangeProject(user, project) && (
          <Button component={RouterLink} to={`/projects/${project.id}/edit`} startIcon={<EditIcon />} variant="outlined">
            Edit project
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value) => setSearchParams({ tab: value }, { replace: true })}
          variant="scrollable"
          aria-label="Project sections"
        >
          {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} id={`tab-${t.value}`} aria-controls={`panel-${t.value}`} />)}
        </Tabs>
        <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} sx={{ p: { xs: 2, sm: 3 } }}>
          {tab === 'overview' && <Overview project={project} />}
          {tab === 'deliverables' && (
            <DeliverablesPanel project={project} onChanged={() => setReloadKey((key) => key + 1)} />
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
