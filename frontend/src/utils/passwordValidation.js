/** Check the form before calling the backend (which applies the same rules). */
export default function validatePasswordChange(values) {
  const errors = {};
  if (!values.current) errors.current = 'Enter your current password';
  if (values.next.length < 10) errors.next = 'Must be at least 10 characters';
  else if (values.next === values.current) errors.next = 'Must be different from the current password';
  if (values.confirm !== values.next) errors.confirm = 'The two new passwords don’t match';
  return errors;
}
