import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { listDepartments } from '../services/departmentsApi';

/**
 * A department dropdown, as a filter ("All departments") or a form field
 * ("None"). The value is a department id, or '' for all/none.
 */
export default function DepartmentSelect({ value, onChange, variant = 'filter', ...fieldProps }) {
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listDepartments().then((items) => !cancelled && setDepartments(items)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filter = variant === 'filter';
  return (
    <TextField
      select
      label="Department"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size={filter ? 'small' : 'medium'}
      sx={filter ? { minWidth: 170 } : undefined}
      slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
      {...fieldProps}
    >
      <MenuItem value="">{filter ? 'All departments' : 'None'}</MenuItem>
      {/* Keep a value that isn't in the list (yet) selectable */}
      {value !== '' && !departments.some((d) => d.id === value) && <MenuItem value={value}>…</MenuItem>}
      {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
    </TextField>
  );
}

DepartmentSelect.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['filter', 'field']),
};
