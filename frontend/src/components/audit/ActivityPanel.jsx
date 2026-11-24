import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useYou from '../../auth/useYou';
import { listAudit } from '../../services/auditApi';
import projectShape from '../projectPropTypes';

const ACTION_COLORS = { create: 'success', update: 'primary', delete: 'error' };
const ENTITY_LABELS = {
  project: 'Project', deliverable: 'Deliverable', dependency: 'Dependency',
  allocation: 'Allocation', budget_entry: 'Spend', resource: 'Person',
};
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function show(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** The Activity tab: who changed what in this project, newest first (admin and the owning PM). */
export default function ActivityPanel({ project }) {
  const you = useYou();
  const [entityType, setEntityType] = useState('');
  const [state, setState] = useState({ key: null, items: [], error: null });
  const key = `${project.id}:${project.updated_at}:${entityType}`;

  useEffect(() => {
    let cancelled = false;
    listAudit({ project_id: project.id, entity_type: entityType, limit: 200 })
      .then((items) => !cancelled && setState({ key, items, error: null }))
      .catch((err) => !cancelled && setState({ key, items: [], error: err.message }));
    return () => { cancelled = true; };
  }, [project.id, entityType, key]);

  let content;
  if (state.key !== key) {
    content = <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading activity" /></Box>;
  } else if (state.error) {
    content = <Alert severity="error">{state.error}</Alert>;
  } else if (state.items.length === 0) {
    content = <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>No changes recorded.</Typography>;
  } else {
    content = (
      <Paper variant="outlined">
        <List aria-label="Activity">
          {state.items.map((entry) => {
            const fields = entry.action === 'update' ? Object.keys(entry.new_values ?? {}) : [];
            return (
              <ListItem key={entry.id} divider sx={{ display: 'block' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                  <Chip size="small" color={ACTION_COLORS[entry.action]} label={entry.action} />
                  <Chip size="small" variant="outlined" label={ENTITY_LABELS[entry.entity_type] ?? entry.entity_type} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.summary}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {you.user(entry.actor_user_id, entry.actor_name) ?? 'Unknown user'} · {TIME_FORMAT.format(new Date(entry.occurred_at))}
                </Typography>
                {fields.length > 0 && (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 3 }}>
                    {fields.map((field) => (
                      <Typography component="li" variant="body2" key={field}>
                        {field}: <s>{show(entry.old_values?.[field])}</s> → {show(entry.new_values[field])}
                      </Typography>
                    ))}
                  </Box>
                )}
              </ListItem>
            );
          })}
        </List>
      </Paper>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2">Activity</Typography>
        <TextField select label="Show" value={entityType} onChange={(event) => setEntityType(event.target.value)} size="small" sx={{ minWidth: 160 }}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}>
          <MenuItem value="">Everything</MenuItem>
          {Object.entries(ENTITY_LABELS).filter(([v]) => v !== 'resource').map(([value, label]) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </TextField>
      </Stack>
      {content}
    </Stack>
  );
}

ActivityPanel.propTypes = { project: projectShape.isRequired };
