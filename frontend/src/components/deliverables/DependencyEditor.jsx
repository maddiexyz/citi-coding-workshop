import { useState } from 'react';
import PropTypes from 'prop-types';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { addDependency, getDeliverable, removeDependency } from '../../services/deliverablesApi';
import deliverableShape, { deliverableSummaryShape } from './deliverablePropTypes';

function ChainGroup({ label, items, onRemove }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {items.length === 0 && <Typography variant="body2" color="text.secondary">None</Typography>}
        {items.map((item) => (
          <Chip
            key={item.id}
            size="small"
            label={item.title}
            color={item.status === 'done' ? 'success' : 'default'}
            variant="outlined"
            onDelete={onRemove ? () => onRemove(item) : undefined}
          />
        ))}
      </Stack>
    </Box>
  );
}

ChainGroup.propTypes = {
  label: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(deliverableSummaryShape).isRequired,
  onRemove: PropTypes.func,
};

/**
 * Shows the dependency chain (depends on → this → needed by) and lets
 * editors add or remove what this deliverable depends on.
 * A cycle or invalid choice is shown under the picker.
 */
export default function DependencyEditor({ deliverable, options, readOnly = false, onChange }) {
  const [choice, setChoice] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const taken = new Set([deliverable.id, ...deliverable.predecessors.map((item) => item.id)]);
  const available = options.filter((item) => !taken.has(item.id));

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
      setChoice(null);
    } catch (err) {
      setError(err.details?.depends_on_id ? `${err.message}: ${err.details.depends_on_id}` : err.message);
    } finally {
      setBusy(false);
    }
  };

  const add = () => run(() => addDependency(deliverable.id, choice.id));
  // Removing returns 204; reload so the blocked flag and chain are current
  const remove = (item) => run(async () => {
    await removeDependency(deliverable.id, item.id);
    return getDeliverable(deliverable.id);
  });

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" component="h3">Dependencies</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <ChainGroup label="Depends on" items={deliverable.predecessors} onRemove={readOnly || busy ? undefined : remove} />
        <ArrowForwardIcon color="action" aria-hidden sx={{ display: { xs: 'none', sm: 'block' } }} />
        <Chip label={deliverable.title} color="primary" />
        <ArrowForwardIcon color="action" aria-hidden sx={{ display: { xs: 'none', sm: 'block' } }} />
        <ChainGroup label="Needed by" items={deliverable.successors} />
      </Stack>
      {!readOnly && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
          <Autocomplete
            options={available}
            value={choice}
            onChange={(_, value) => { setChoice(value); setError(null); }}
            getOptionLabel={(item) => item.title}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            disabled={busy}
            sx={{ flexGrow: 1 }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Add a dependency"
                error={Boolean(error)}
                helperText={error ?? 'This deliverable cannot finish before the one you pick'}
              />
            )}
          />
          <Button onClick={add} disabled={!choice || busy} variant="outlined">Add</Button>
        </Stack>
      )}
    </Stack>
  );
}

DependencyEditor.propTypes = {
  deliverable: deliverableShape.isRequired,
  options: PropTypes.arrayOf(deliverableSummaryShape).isRequired,
  readOnly: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
};
