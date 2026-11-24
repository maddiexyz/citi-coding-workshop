/** Project statuses, in workflow order, with their display label and chip color. */
export const PROJECT_STATUSES = [
  { value: 'planned', label: 'Planned', color: 'default' },
  { value: 'active', label: 'Active', color: 'primary' },
  { value: 'on_hold', label: 'On hold', color: 'warning' },
  { value: 'completed', label: 'Completed', color: 'success' },
  { value: 'cancelled', label: 'Cancelled', color: 'error' },
];

/**
 * @param {string} value A status value such as "on_hold".
 * @param {Array<{value: string}>} [statuses] The list to look in (projects by default).
 * @returns {{value: string, label: string, color: string}} Its display settings.
 */
export function statusInfo(value, statuses = PROJECT_STATUSES) {
  return statuses.find((status) => status.value === value)
    ?? { value, label: value, color: 'default' };
}
