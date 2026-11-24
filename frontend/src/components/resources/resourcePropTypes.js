import PropTypes from 'prop-types';

const decimal = PropTypes.oneOfType([PropTypes.string, PropTypes.number]);

/** Shape of a resource (person) as returned by the resources API. */
const resourceShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  full_name: PropTypes.string.isRequired,
  email: PropTypes.string,
  title: PropTypes.string,
  department: PropTypes.string,
  weekly_hours: decimal.isRequired,
  week_hours: decimal,
  over_allocated: PropTypes.bool,
  is_active: PropTypes.bool.isRequired,
});

export default resourceShape;
