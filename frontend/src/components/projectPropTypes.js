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
  department_id: PropTypes.number,
  department_name: PropTypes.string,
  deliverables_total: PropTypes.number,
  deliverables_done: PropTypes.number,
  budget_planned: PropTypes.string,
  actual_spend: PropTypes.string,
  burn_pct: PropTypes.string,
  over_budget: PropTypes.bool,
  deliverable_count: PropTypes.number,
  allocation_count: PropTypes.number,
  budget_entry_count: PropTypes.number,
});

export default projectShape;
