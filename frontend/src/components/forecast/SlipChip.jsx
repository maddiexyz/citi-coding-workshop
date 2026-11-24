import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';

const days = (count) => `${count} day${count === 1 ? '' : 's'}`;

/** The slip against the planned end as a chip: late (red), on time or early (green), nothing without an end date. */
export default function SlipChip({ slipDays = null }) {
  if (slipDays === null || slipDays === undefined) return null;
  if (slipDays > 0) return <Chip size="small" color="error" label={`${days(slipDays)} late`} />;
  return <Chip size="small" color="success" label={slipDays === 0 ? 'On time' : `${days(-slipDays)} early`} />;
}

SlipChip.propTypes = { slipDays: PropTypes.number };
