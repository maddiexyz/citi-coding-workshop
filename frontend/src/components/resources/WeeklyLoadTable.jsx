import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import OverAllocatedChip from './OverAllocatedChip';
import { formatHours, formatWeek } from '../../utils/format';

/** Hours allocated per week against capacity, with over-allocated weeks highlighted. */
export default function WeeklyLoadTable({ weeks }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Weekly load">
        <TableHead>
          <TableRow>
            <TableCell>Week</TableCell>
            <TableCell align="right">Allocated</TableCell>
            <TableCell align="right">Capacity</TableCell>
            <TableCell>Projects</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {weeks.map((week) => {
            const over = Number(week.over_by) > 0;
            return (
              <TableRow key={week.week_start} sx={over ? { backgroundColor: 'rgba(237, 108, 2, 0.08)' } : undefined}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWeek(week.week_start)}</TableCell>
                <TableCell align="right">{formatHours(week.total_hours)}</TableCell>
                <TableCell align="right">{formatHours(week.weekly_hours)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {week.projects.map((p) => (
                      <Chip key={p.project_id} size="small" variant="outlined" label={`${p.project_code} · ${formatHours(p.hours)}`} />
                    ))}
                  </Stack>
                </TableCell>
                <TableCell>{over ? <OverAllocatedChip overBy={week.over_by} /> : '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

WeeklyLoadTable.propTypes = {
  weeks: PropTypes.arrayOf(PropTypes.shape({
    week_start: PropTypes.string.isRequired,
    total_hours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    weekly_hours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    over_by: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    projects: PropTypes.arrayOf(PropTypes.shape({
      project_id: PropTypes.number.isRequired,
      project_code: PropTypes.string.isRequired,
      hours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    })).isRequired,
  })).isRequired,
};
