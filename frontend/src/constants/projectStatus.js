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
 * @returns {{value: string, label: string, color: string}} Its display settings.
 */
export function statusInfo(value) {
  return PROJECT_STATUSES.find((status) => status.value === value)
    ?? { value, label: value, color: 'default' };
}
