import { formatDate, formatHours } from '../../utils/format';

/**
 * Explain the over-allocation warnings returned when an allocation is saved.
 * @param {string} name The person's name.
 * @param {Array<{week_start: string, total_hours: string, weekly_hours: string, over_by: string}>} warnings
 * @returns {string}
 */
export default function overAllocationMessage(name, warnings) {
  const first = warnings[0];
  const detail = `week of ${formatDate(first.week_start)}: ${formatHours(first.total_hours)} of ${formatHours(first.weekly_hours)} (+${formatHours(first.over_by)})`;
  const more = warnings.length > 1 ? ` and ${warnings.length - 1} more week(s)` : '';
  return `Saved, but ${name} is over-allocated in the ${detail}${more}.`;
}
