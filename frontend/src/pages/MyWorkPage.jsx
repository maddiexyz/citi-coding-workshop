import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import { useMediaQuery } from 'react-responsive';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useAuth from '../auth/useAuth';
import ProjectStatusChip from '../components/ProjectStatusChip';
import BurnChip from '../components/budget/BurnChip';
import DeliverableFlags from '../components/deliverables/DeliverableFlags';
import OverAllocatedChip from '../components/resources/OverAllocatedChip';
import WeeklyLoadTable from '../components/resources/WeeklyLoadTable';
import { listAllocations } from '../services/allocationsApi';
import { listAtRiskProjects } from '../services/dashboardApi';
import { listDeliverables } from '../services/deliverablesApi';
import { listProjects } from '../services/projectsApi';
import { getResource, getResourceLoad } from '../services/resourcesApi';
import { formatDate, formatHours } from '../utils/format';

const SEVERITY = { high: { label: 'High risk', color: 'error' }, medium: { label: 'At risk', color: 'warning' } };

/** Run a loader once (per key) and track its result, error and loading state. */
function useLoaded(load, key) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((err) => !cancelled && setState({ key, data: null, error: err.message }));
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, loading: state.key !== key };
}

function Section({ title, loading, error, empty, emptyText, children }) {
  let body = children;
  if (loading) body = <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress aria-label={`Loading ${title.toLowerCase()}`} /></Box>;
  else if (error) body = <Alert severity="error">{error}</Alert>;
  else if (empty) body = <Typography color="text.secondary">{emptyText}</Typography>;
  return (
    <Paper variant="outlined" component="section" aria-label={title} sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" component="h2" gutterBottom>{title}</Typography>
      {body}
    </Paper>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  empty: PropTypes.bool.isRequired,
  emptyText: PropTypes.string.isRequired,
  children: PropTypes.node,
};

/** My allocations over the next 8 weeks, my load against my capacity. */
function MyAllocations({ resourceId }) {
  const { data, error, loading } = useLoaded(async () => {
    const [person, load, allocations] = await Promise.all([
      getResource(resourceId), getResourceLoad(resourceId), listAllocations({ resource: 'me' }),
    ]);
    const first = load.weeks[0]?.week_start;
    const last = load.weeks.at(-1)?.week_start;
    // Allocations that touch the 8 weeks shown (string dates compare correctly)
    const upcoming = allocations.filter((a) => (!first || a.end_date >= first) && (!last || a.start_date <= last));
    return { person, weeks: load.weeks, allocations: upcoming };
  }, `allocations:${resourceId}`);

  const overWeeks = data?.weeks.filter((w) => Number(w.over_by) > 0) ?? [];
  return (
    <Section
      title="My allocations (next 8 weeks)"
      loading={loading}
      error={error}
      empty={Boolean(data) && data.allocations.length === 0}
      emptyText="You have no allocations in the next 8 weeks."
    >
      {data && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Capacity {formatHours(data.person.weekly_hours)} a week
          </Typography>
          {overWeeks.length > 0 && (
            <Alert severity="warning" icon={false}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                <OverAllocatedChip />
                <span>
                  You are allocated beyond your capacity in {overWeeks.length} of the next 8 weeks
                  (first: week of {formatDate(overWeeks[0].week_start)}, {formatHours(overWeeks[0].total_hours)} of {formatHours(overWeeks[0].weekly_hours)}).
                </span>
              </Stack>
            </Alert>
          )}
          <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="My allocations">
            {data.allocations.map((a) => (
              <Typography component="li" key={a.id} variant="body2">
                <Link component={RouterLink} to={`/projects/${a.project_id}?tab=allocations`}>{a.project_code} – {a.project_name}</Link>
                {` · ${formatHours(a.hours_per_week)} a week · ${formatDate(a.start_date)} – ${formatDate(a.end_date)}`}
              </Typography>
            ))}
          </Stack>
          <WeeklyLoadTable weeks={data.weeks} />
        </Stack>
      )}
    </Section>
  );
}

MyAllocations.propTypes = { resourceId: PropTypes.number.isRequired };

/** Deliverables assigned to me that need attention: overdue, blocked, or due within 7 days. */
function MyDeliverables() {
  const { data, error, loading } = useLoaded(async () => {
    const [overdue, blocked, dueSoon] = await Promise.all([
      listDeliverables({ assignee: 'me', overdue: true }),
      listDeliverables({ assignee: 'me', blocked: true }),
      listDeliverables({ assignee: 'me', due_soon: true }),
    ]);
    return [
      { title: 'Overdue', items: overdue },
      { title: 'Blocked', items: blocked.filter((d) => !['done', 'cancelled'].includes(d.status)) },
      { title: 'Due within 7 days', items: dueSoon },
    ];
  }, 'deliverables');

  const total = data?.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
  return (
    <Section
      title="My deliverables"
      loading={loading}
      error={error}
      empty={Boolean(data) && total === 0}
      emptyText="Nothing assigned to you is overdue, blocked or due within 7 days."
    >
      {data && (
        <Stack spacing={2}>
          {data.filter((group) => group.items.length > 0).map((group) => (
            <Box key={group.title}>
              <Typography variant="subtitle2" component="h3">{group.title} ({group.items.length})</Typography>
              <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label={group.title}>
                {group.items.map((d) => (
                  <Stack component="li" key={d.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <Link component={RouterLink} to={`/projects/${d.project_id}?tab=deliverables`}>{d.title}</Link>
                    <Typography variant="body2" color="text.secondary">{d.project_code} · due {formatDate(d.due_date)}</Typography>
                    <DeliverableFlags isBlocked={d.is_blocked} isOverdue={d.is_overdue} />
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/** Projects I own or lead, with their at-risk and over-budget flags. */
function MyProjects() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const { data, error, loading } = useLoaded(async () => {
    const [owned, led, flagged] = await Promise.all([
      listProjects({ owner: 'me' }), listProjects({ team_lead: 'me' }), listAtRiskProjects(),
    ]);
    const risk = new Map(flagged.map((p) => [p.id, p]));
    const byId = new Map();
    owned.forEach((p) => byId.set(p.id, { ...p, roles: ['Owner'] }));
    led.forEach((p) => (byId.has(p.id) ? byId.get(p.id).roles.push('Team lead') : byId.set(p.id, { ...p, roles: ['Team lead'] })));
    return [...byId.values()].map((p) => ({ ...p, severity: risk.get(p.id)?.severity ?? null, risk_reasons: risk.get(p.id)?.risk_reasons ?? [] }));
  }, 'projects');

  return (
    <Section
      title="My projects"
      loading={loading}
      error={error}
      empty={Boolean(data) && data.length === 0}
      emptyText="You don't own or lead any projects."
    >
      {data && (
        <Box component="ul" aria-label="My projects" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr' }}>
          {data.map((p) => (
            <Card key={p.id} variant="outlined" component="li">
              <CardContent>
                <Typography variant="overline" sx={{ fontWeight: 600 }}>{p.code} · {p.roles.join(' & ')}</Typography>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                  <Link component={RouterLink} to={`/projects/${p.id}`}>{p.name}</Link>
                </Typography>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', my: 1 }}>
                  <ProjectStatusChip status={p.status} />
                  {p.severity && <Chip size="small" color={SEVERITY[p.severity].color} label={SEVERITY[p.severity].label} />}
                  <BurnChip project={p} />
                </Stack>
                {p.risk_reasons.length > 0 && (
                  <Typography variant="body2" color="text.secondary">{p.risk_reasons.map((r) => r.message).join(' · ')}</Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Section>
  );
}

/** The signed-in user's own work: allocations, deliverables and projects. */
export default function MyWorkPage() {
  const { user } = useAuth();
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">My work</Typography>
        <Typography color="text.secondary">{user.full_name}</Typography>
      </Box>
      {user.resource_id ? (
        <>
          <MyDeliverables />
          <MyAllocations resourceId={user.resource_id} />
        </>
      ) : (
        <Alert severity="info">
          Your account isn&apos;t linked to a person yet, so you have no allocations or assigned deliverables.
          They appear here once an admin links your account to a person on the People page.
        </Alert>
      )}
      <MyProjects />
    </Stack>
  );
}
