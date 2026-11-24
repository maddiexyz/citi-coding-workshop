import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import BlockIcon from '@mui/icons-material/Block';
import ScheduleIcon from '@mui/icons-material/Schedule';

/** "Blocked" and "Overdue" chips (both computed by the backend). */
export default function DeliverableFlags({ isBlocked, isOverdue }) {
  if (!isBlocked && !isOverdue) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {isBlocked && <Chip size="small" color="warning" icon={<BlockIcon />} label="Blocked" />}
      {isOverdue && <Chip size="small" color="error" icon={<ScheduleIcon />} label="Overdue" />}
    </Stack>
  );
}

DeliverableFlags.propTypes = {
  isBlocked: PropTypes.bool.isRequired,
  isOverdue: PropTypes.bool.isRequired,
};
