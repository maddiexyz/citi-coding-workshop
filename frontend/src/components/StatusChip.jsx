import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { PROJECT_STATUSES, statusInfo } from '../constants/projectStatus';

/** A colored chip showing a status from a list such as PROJECT_STATUSES or DELIVERABLE_STATUSES. */
export default function StatusChip({ status, statuses = PROJECT_STATUSES }) {
  const { label, color } = statusInfo(status, statuses);
  return <Chip label={label} color={color} size="small" variant={color === 'default' ? 'outlined' : 'filled'} />;
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
  statuses: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired })),
};
