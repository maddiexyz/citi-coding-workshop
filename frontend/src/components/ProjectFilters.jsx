import PropTypes from 'prop-types';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { PROJECT_STATUSES } from '../constants/projectStatus';
import DepartmentSelect from './DepartmentSelect';

/** Search box and status filter for the projects list. */
export default function ProjectFilters({
  search, status, departmentId = '', onSearchChange, onStatusChange, onDepartmentChange = null,
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        label="Search"
        placeholder="Name or code"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        size="small"
        sx={{ flexGrow: 1 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
          },
        }}
      />
      <TextField
        select
        label="Status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        size="small"
        sx={{ minWidth: 180 }}
        // Show "All statuses" (the empty value) instead of an empty box
        slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      >
        <MenuItem value="">All statuses</MenuItem>
        {PROJECT_STATUSES.map((option) => (
          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
        ))}
      </TextField>
      {onDepartmentChange && <DepartmentSelect value={departmentId} onChange={onDepartmentChange} />}
    </Stack>
  );
}

ProjectFilters.propTypes = {
  search: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  departmentId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onSearchChange: PropTypes.func.isRequired,
  onStatusChange: PropTypes.func.isRequired,
  onDepartmentChange: PropTypes.func,
};
