import PropTypes from 'prop-types';

/** A deliverable in a predecessor/successor list. */
export const deliverableSummaryShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  is_blocked: PropTypes.bool,
});

/** Shape of a deliverable as returned by the deliverables API. */
const deliverableShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  project_id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  status: PropTypes.string.isRequired,
  due_date: PropTypes.string,
  estimate_days: PropTypes.number,
  earliest_start: PropTypes.string,
  progress_pct: PropTypes.number,
  assignee_resource_id: PropTypes.number,
  assignee_name: PropTypes.string,
  is_blocked: PropTypes.bool.isRequired,
  is_overdue: PropTypes.bool.isRequired,
  predecessor_count: PropTypes.number,
  predecessors: PropTypes.arrayOf(deliverableSummaryShape),
  successors: PropTypes.arrayOf(deliverableSummaryShape),
});

export default deliverableShape;
