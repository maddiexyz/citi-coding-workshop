/**
 * Client-side checks that mirror the backend's allocation validation.
 * @param {{resource_id: number|null, hours_per_week: string, start_date: string, end_date: string}} values
 * @param {{start_date?: string|null, end_date?: string|null}} project
 * @returns {Object<string, string>} Error message per invalid field.
 */
export default function validateAllocation(values, project) {
  const errors = {};
  if (!values.resource_id) errors.resource_id = 'Choose a person';
  const hours = Number(values.hours_per_week);
  if (values.hours_per_week === '' || Number.isNaN(hours)) errors.hours_per_week = 'Hours per week are required';
  else if (hours <= 0 || hours > 80) errors.hours_per_week = 'Must be more than 0 and at most 80';
  if (!values.start_date) errors.start_date = 'Start date is required';
  else if (project.start_date && values.start_date < project.start_date) {
    errors.start_date = 'Must be on or after the project start';
  }
  if (!values.end_date) errors.end_date = 'End date is required';
  else if (values.start_date && values.end_date < values.start_date) {
    errors.end_date = 'End date must be on or after the start date';
  } else if (project.end_date && values.end_date > project.end_date) {
    errors.end_date = 'Must be on or before the project end';
  }
  return errors;
}
