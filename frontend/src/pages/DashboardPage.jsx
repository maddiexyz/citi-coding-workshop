import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import BurnChip from '../components/budget/BurnChip';
import DepartmentSelect from '../components/DepartmentSelect';
import ProjectStatusChip from '../components/ProjectStatusChip';
import { getDashboardSummary, listAtRiskProjects } from '../services/dashboardApi';
import { formatDate, formatHours, LOCALE } from '../utils/format';
import useAutoRefresh from '../utils/useAutoRefresh';
import useDebouncedValue from '../utils/useDebouncedValue';

const REFRESH_MS = 30000;
const TIME = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });

const SEVERITY = { high: { label: 'High risk', color: 'error' }, medium: { label: 'At risk', color: 'warning' } };

const STAT_ICONS = {
  projects: FolderOpenIcon,
  risk: WarningAmberIcon,
  budget: AccountBalanceWalletIcon,
  overdue: EventBusyIcon,
  people: GroupOutlinedIcon,
};

/**
 * One summary number. The tone colours the icon and the left edge; the
 * status is also written out ("Needs attention" / "All clear"), so it never
 * depends on colour alone.
 */
function StatCard({ label, value, hint = null, to = null, tone = 'default', icon }) {
  const Icon = STAT_ICONS[icon];
  const flagged = tone !== 'default' && value > 0;
  const colour = flagged ? `${tone}.main` : 'primary.main';
  const body = (
    <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, flexShrink: 0, color: colour,
          bgcolor: alpha(flagged ? theme.palette[tone].main : theme.palette.primary.main, 0.12),
        })}
      >
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="h2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="h4" component="p" sx={{ lineHeight: 1.1, my: 0.25 }} color={flagged ? colour : 'text.primary'}>
          {value}
        </Typography>
        {tone !== 'default' && (
          <Typography variant="caption" component="p" sx={{ fontWeight: 600 }} color="text.secondary">
            {flagged ? 'Needs attention' : 'All clear'}
          </Typography>
        )}
        {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
      </Box>
    </CardContent>
  );
  return (
    <Card
      variant="outlined"
      sx={{ flex: '1 1 180px', borderLeft: 4, borderLeftColor: flagged ? colour : 'divider' }}
    >
      {to ? <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>{body}</CardActionArea> : body}
    </Card>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  hint: PropTypes.string,
  to: PropTypes.string,
  tone: PropTypes.oneOf(['default', 'error', 'warning']),
  icon: PropTypes.oneOf(Object.keys(STAT_ICONS)).isRequired,
};

/** One project's risk reasons, each with its details spelled out. */
function RiskReasons({ reasons }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {reasons.map((reason) => (
        <Typography component="li" variant="body2" key={reason.type}>
          <strong>{reason.message}</strong>
          {reason.details.deliverables && (
            <>: {reason.details.deliverables.map((d) => `${d.title} (due ${formatDate(d.due_date)})`).join(', ')}</>
          )}
          {reason.details.people && (
            <>: {reason.details.people.map((p) => `${p.full_name} ${formatHours(p.total_hours)} of ${formatHours(p.weekly_hours)}`).join(', ')}</>
          )}
        </Typography>
      ))}
    </Box>
  );
}

RiskReasons.propTypes = {
  reasons: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    details: PropTypes.shape({
      deliverables: PropTypes.arrayOf(PropTypes.shape({ title: PropTypes.string })),
      people: PropTypes.arrayOf(PropTypes.shape({ full_name: PropTypes.string })),
    }).isRequired,
  })).isRequired,
};

function Flags({ project }) {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {project.severity && <Chip size="small" color={SEVERITY[project.severity].color} label={SEVERITY[project.severity].label} />}
      {project.over_budget && <BurnChip project={project} />}
    </Stack>
  );
}

Flags.propTypes = {
  project: PropTypes.shape({ severity: PropTypes.string, over_budget: PropTypes.bool }).isRequired,
};

/** Portfolio health: summary cards, projects at risk (with why) and over-allocated people. */
export default function DashboardPage() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [summary, setSummary] = useState({ data: null, error: null });
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const [flag, setFlag] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [list, setList] = useState({ key: null, items: [], error: null });
  const [updatedAt, setUpdatedAt] = useState(null);
  // Polling: refresh every 30 s while the tab is visible (the dashboard has no push channel)
  const { tick, refresh } = useAutoRefresh(REFRESH_MS);
  const listKey = `${q}|${flag}|${departmentId}`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDashboardSummary()
        .then((data) => !cancelled && setSummary({ data, error: null }))
        .catch((err) => !cancelled && setSummary((current) => ({ data: current.data, error: err.message }))),
      listAtRiskProjects({ q, flag, department_id: departmentId })
        .then((items) => !cancelled && setList({ key: listKey, items, error: null }))
        .catch((err) => !cancelled && setList({ key: listKey, items: [], error: err.message })),
    ]).then(() => !cancelled && setUpdatedAt(new Date()));
    return () => { cancelled = true; };
  }, [q, flag, departmentId, listKey, tick]);

  const s = summary.data;
  let projects;
  if (list.key !== listKey) {
    projects = <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress aria-label="Loading projects at risk" /></Box>;
  } else if (list.error) {
    projects = <Alert severity="error">{list.error}</Alert>;
  } else if (list.items.length === 0) {
    projects = (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        {q || flag || departmentId ? 'No flagged projects match these filters.' : 'No projects are at risk or over budget. 🎉'}
      </Typography>
    );
  } else {
    projects = (
      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Projects at risk">
        {list.items.map((project) => (
          <Card key={project.id} variant="outlined" component="li">
            <CardContent>
              <Stack direction={isDesktop ? 'row' : 'column'} spacing={isDesktop ? 3 : 1}>
                <Box sx={{ minWidth: isDesktop ? 260 : 0 }}>
                  <Typography variant="overline" sx={{ fontWeight: 600 }}>{project.code}</Typography>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                    <Link component={RouterLink} to={`/projects/${project.id}`}>{project.name}</Link>
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ my: 0.5, alignItems: 'center' }}>
                    <ProjectStatusChip status={project.status} />
                    <Typography variant="body2" color="text.secondary">
                      Ends {formatDate(project.end_date)}{project.department_name ? ` · ${project.department_name}` : ''}
                    </Typography>
                  </Stack>
                  <Flags project={project} />
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  {project.risk_reasons.length > 0
                    ? <RiskReasons reasons={project.risk_reasons} />
                    : <Typography variant="body2">Over budget: {project.burn_pct}% of the planned budget spent.</Typography>}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>Dashboard</Typography>
        <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
          {updatedAt ? `Updated ${TIME.format(updatedAt)}` : 'Loading…'}
        </Typography>
        <Tooltip title="Refresh now">
          <IconButton aria-label="Refresh now" onClick={refresh}><RefreshIcon /></IconButton>
        </Tooltip>
      </Stack>
      {summary.error && <Alert severity="error">{summary.error}</Alert>}
      {!s && !summary.error && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress aria-label="Loading summary" /></Box>}
      {s && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 2 }}>
          <StatCard label="Active projects" value={s.active_projects} to="/projects" icon="projects" />
          <StatCard label="At risk" value={s.at_risk} tone="warning" icon="risk" hint={s.high_risk ? `${s.high_risk} past their end date` : null} />
          <StatCard label="Over budget" value={s.over_budget} tone="error" icon="budget" />
          <StatCard label="Overdue deliverables" value={s.overdue_deliverables} tone="warning" icon="overdue" hint={`${s.blocked_deliverables} blocked`} />
          <StatCard label="Over-allocated this week" value={s.over_allocated_people.length} tone="warning" to="/resources" icon="people" />
        </Stack>
      )}

      <Stack direction={isDesktop ? 'row' : 'column'} spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Stack spacing={2} sx={{ flex: 3, width: '100%' }}>
          <Typography variant="h6" component="h2">Projects needing attention</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} size="small" sx={{ flexGrow: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <TextField select label="Show" value={flag} onChange={(e) => setFlag(e.target.value)} size="small" sx={{ minWidth: 170 }}
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
              <MenuItem value="">At risk or over budget</MenuItem>
              <MenuItem value="at_risk">At risk</MenuItem>
              <MenuItem value="over_budget">Over budget</MenuItem>
            </TextField>
            <DepartmentSelect value={departmentId} onChange={setDepartmentId} />
          </Stack>
          {projects}
        </Stack>

        <Paper variant="outlined" sx={{ flex: 1, width: '100%', p: 2 }}>
          <Typography variant="h6" component="h2" gutterBottom>Over-allocated this week</Typography>
          {s && s.over_allocated_people.length === 0 && <Typography color="text.secondary">Nobody is over capacity.</Typography>}
          {s && s.over_allocated_people.length > 0 && (
            <List dense aria-label="Over-allocated people">
              {s.over_allocated_people.map((person) => (
                <ListItem key={person.id} disableGutters>
                  <Link component={RouterLink} to={`/resources/${person.id}`}>{person.full_name}</Link>
                  &nbsp;– {formatHours(person.total_hours)} of {formatHours(person.weekly_hours)}
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Stack>
    </Stack>
  );
}
