import PropTypes from 'prop-types';

/** Shape of a project as returned by the projects API. */
const projectShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  status: PropTypes.string.isRequired,
  start_date: PropTypes.string,
  end_date: PropTypes.string,
  owner_id: PropTypes.number.isRequired,
  owner_name: PropTypes.string,
  team_lead_id: PropTypes.number,
  team_lead_name: PropTypes.string,
  deliverables_total: PropTypes.number,
  deliverables_done: PropTypes.number,
});

export default projectShape;
