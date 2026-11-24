import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { formatHours } from '../../utils/format';

/** Warning chip for a person allocated beyond their weekly capacity (a flag, never a block). */
export default function OverAllocatedChip({ overBy = null }) {
  const label = overBy ? `Over by ${formatHours(overBy)}` : 'Over-allocated';
  return <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={label} />;
}

OverAllocatedChip.propTypes = {
  overBy: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
