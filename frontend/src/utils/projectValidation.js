/**
 * Client-side checks that mirror the backend's project validation, so users
 * see problems before submitting. The backend still validates everything.
 */

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

/**
 * @param {{code: string, name: string, description: string,
 *   start_date: string, end_date: string}} values Form values.
 * @returns {Object<string, string>} Error message per invalid field (empty when valid).
 */
export default function validateProject(values) {
  const errors = {};
  const code = values.code.trim().toUpperCase();
  if (!code) errors.code = 'Code is required';
  else if (!CODE_PATTERN.test(code)) errors.code = 'Use 2-20 letters, digits or dashes, e.g. ACME-01';

  if (!values.name.trim()) errors.name = 'Name is required';
  else if (values.name.trim().length > 200) errors.name = 'Must be at most 200 characters';

  if (values.description.length > 2000) errors.description = 'Must be at most 2000 characters';

  const budget = String(values.budget_planned ?? '').trim();
  if (budget && !/^\d{1,10}(\.\d{1,2})?$/.test(budget)) {
    errors.budget_planned = 'Enter an amount of 0 or more, with at most 2 decimals';
  }

  // "YYYY-MM-DD" strings compare correctly as text
  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    errors.end_date = 'End date must be on or after the start date';
  }
  return errors;
}
