import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import BlockIcon from '@mui/icons-material/Block';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TimelineIcon from '@mui/icons-material/Timeline';

/** "Blocked", "Overdue" and "Critical" (on the forecast's critical path) chips, all computed by the backend. */
export default function DeliverableFlags({ isBlocked, isOverdue, isCritical = false }) {
  if (!isBlocked && !isOverdue && !isCritical) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {isBlocked && <Chip size="small" color="warning" icon={<BlockIcon />} label="Blocked" />}
      {isOverdue && <Chip size="small" color="error" icon={<ScheduleIcon />} label="Overdue" />}
      {isCritical && <Chip size="small" color="primary" variant="outlined" icon={<TimelineIcon />} label="Critical" />}
    </Stack>
  );
}

DeliverableFlags.propTypes = {
  isBlocked: PropTypes.bool.isRequired,
  isOverdue: PropTypes.bool.isRequired,
  isCritical: PropTypes.bool,
};
