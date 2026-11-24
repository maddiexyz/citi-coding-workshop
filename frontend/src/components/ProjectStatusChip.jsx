import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { statusInfo } from '../constants/projectStatus';

/** A colored chip showing a project's status. */
export default function ProjectStatusChip({ status }) {
  const { label, color } = statusInfo(status);
  return <Chip label={label} color={color} size="small" variant={color === 'default' ? 'outlined' : 'filled'} />;
}

ProjectStatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};
