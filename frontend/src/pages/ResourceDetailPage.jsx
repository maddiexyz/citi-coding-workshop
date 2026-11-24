import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import useYou from '../auth/useYou';
import OverAllocatedChip from '../components/resources/OverAllocatedChip';
import WeeklyLoadTable from '../components/resources/WeeklyLoadTable';
import { getResource, getResourceLoad } from '../services/resourcesApi';
import { formatDate, formatHours } from '../utils/format';

/** One person: capacity, allocations and their load for the next 8 weeks. */
export default function ResourceDetailPage() {
  const { id } = useParams();
  const you = useYou();
  const [state, setState] = useState({ key: null, resource: null, weeks: [], error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getResource(id), getResourceLoad(id)])
      .then(([resource, load]) => !cancelled && setState({ key: id, resource, weeks: load.weeks, error: null }))
      .catch((err) => !cancelled && setState({ key: id, resource: null, weeks: [], error: err.message }));
    return () => { cancelled = true; };
  }, [id]);

  if (state.key !== id) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading person" /></Box>;
  }
  const { resource, weeks, error } = state;
  if (!resource) {
    return <Alert severity="error" action={<Button component={RouterLink} to="/resources">Back</Button>}>{error}</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Button component={RouterLink} to="/resources" startIcon={<ArrowBackIcon />} sx={{ alignSelf: 'flex-start' }}>People</Button>
      <Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h4" component="h1">{you.resource(resource.id, resource.full_name)}</Typography>
          {!resource.is_active && <Chip size="small" variant="outlined" label="Inactive" />}
          {resource.over_allocated && <OverAllocatedChip />}
        </Stack>
        <Typography color="text.secondary">
          {[resource.title, resource.department_name, resource.email].filter(Boolean).join(' · ')}
          {' · '}
          Capacity {formatHours(resource.weekly_hours)} / week
          {resource.user_name && ` · Signs in as ${resource.user_name}`}
        </Typography>
      </Box>

      <Box>
        <Typography variant="h6" component="h2" gutterBottom>Next 8 weeks</Typography>
        <WeeklyLoadTable weeks={weeks} />
      </Box>

      <Box>
        <Typography variant="h6" component="h2" gutterBottom>Allocations</Typography>
        {resource.allocations.length === 0 ? (
          <Typography color="text.secondary">Not allocated to any project.</Typography>
        ) : (
          <Paper variant="outlined">
            <List aria-label="Allocations">
              {resource.allocations.map((a) => (
                <ListItem key={a.id} divider>
                  <ListItemText
                    primary={(
                      <Link component={RouterLink} to={`/projects/${a.project_id}?tab=allocations`}>
                        {a.project_code} – {a.project_name}
                      </Link>
                    )}
                    secondary={`${formatHours(a.hours_per_week)} / week · ${formatDate(a.start_date)} – ${formatDate(a.end_date)}${a.note ? ` · ${a.note}` : ''}`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
