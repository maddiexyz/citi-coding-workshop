/**
 * Client-side checks that mirror the backend's deliverable validation.
 * The backend still validates everything.
 * @param {{title: string, description: string}} values Form values.
 * @returns {Object<string, string>} Error message per invalid field (empty when valid).
 */
export default function validateDeliverable(values) {
  const errors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Title is required';
  else if (title.length > 200) errors.title = 'Must be at most 200 characters';
  if (values.description.length > 2000) errors.description = 'Must be at most 2000 characters';
  return errors;
}
