/**
 * Client-side checks that mirror the backend's user validation.
 * @param {{email: string, full_name: string, password: string}} values
 * @param {{creating: boolean}} options Whether a password is required.
 * @returns {Object<string, string>} Error message per invalid field.
 */
export default function validateUser(values, { creating }) {
  const errors = {};
  if (!values.full_name.trim()) errors.full_name = 'Name is required';
  if (!values.email.trim()) errors.email = 'Email is required';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) errors.email = 'Must be an email address';
  if (creating && values.password.length < 10) errors.password = 'Must be at least 10 characters';
  return errors;
}
