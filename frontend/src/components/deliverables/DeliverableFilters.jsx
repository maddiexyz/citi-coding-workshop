import PropTypes from 'prop-types';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { DELIVERABLE_STATUSES } from '../../constants/deliverableStatus';

/** Search box, status filter and blocked/overdue switches for a deliverables list. */
export default function DeliverableFilters({ filters, onChange }) {
  const set = (name) => (event) => onChange({ ...filters, [name]: event.target.value });
  const toggle = (name) => (event) => onChange({ ...filters, [name]: event.target.checked });
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
      <TextField
        label="Search deliverables"
        value={filters.search}
        onChange={set('search')}
        size="small"
        sx={{ flexGrow: 1 }}
        slotProps={{
          input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
        }}
      />
      <TextField
        select
        label="Status"
        value={filters.status}
        onChange={set('status')}
        size="small"
        sx={{ minWidth: 170 }}
        slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      >
        <MenuItem value="">All statuses</MenuItem>
        {DELIVERABLE_STATUSES.map((option) => (
          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
        ))}
      </TextField>
      <Stack direction="row">
        <FormControlLabel control={<Switch checked={filters.blocked} onChange={toggle('blocked')} />} label="Blocked" />
        <FormControlLabel control={<Switch checked={filters.overdue} onChange={toggle('overdue')} />} label="Overdue" />
      </Stack>
    </Stack>
  );
}

DeliverableFilters.propTypes = {
  filters: PropTypes.shape({
    search: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    blocked: PropTypes.bool.isRequired,
    overdue: PropTypes.bool.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
