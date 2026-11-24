import PropTypes from 'prop-types';
import StatusChip from './StatusChip';

/** A colored chip showing a project's status. */
export default function ProjectStatusChip({ status }) {
  return <StatusChip status={status} />;
}

ProjectStatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};
