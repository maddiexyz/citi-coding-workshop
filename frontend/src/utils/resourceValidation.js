/**
 * Client-side checks that mirror the backend's resource validation.
 * @param {{full_name: string, email: string, weekly_hours: string}} values
 * @returns {Object<string, string>} Error message per invalid field.
 */
export default function validateResource(values) {
  const errors = {};
  if (!values.full_name.trim()) errors.full_name = 'Name is required';
  if (values.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) {
    errors.email = 'Must be an email address';
  }
  const hours = Number(values.weekly_hours);
  if (values.weekly_hours === '' || Number.isNaN(hours)) errors.weekly_hours = 'Weekly hours are required';
  else if (hours <= 0 || hours > 60) errors.weekly_hours = 'Must be more than 0 and at most 60';
  return errors;
}
