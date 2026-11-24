/**
 * Client-side checks that mirror the backend's deliverable validation.
 * The backend still validates everything.
 * @param {{title: string, description: string, estimate_days: (string|number), progress_pct: (string|number)}} values Form values.
 * @returns {Object<string, string>} Error message per invalid field (empty when valid).
 */
export default function validateDeliverable(values) {
  const errors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Title is required';
  else if (title.length > 200) errors.title = 'Must be at most 200 characters';
  if (values.description.length > 2000) errors.description = 'Must be at most 2000 characters';
  const wholeNumber = (value) => /^\d+$/.test(String(value));
  if (values.estimate_days !== '' && values.estimate_days !== undefined
    && (!wholeNumber(values.estimate_days) || Number(values.estimate_days) < 1 || Number(values.estimate_days) > 365)) {
    errors.estimate_days = 'Must be a whole number from 1 to 365';
  }
  if (values.progress_pct !== '' && values.progress_pct !== undefined
    && (!wholeNumber(values.progress_pct) || Number(values.progress_pct) > 100)) {
    errors.progress_pct = 'Must be a whole number from 0 to 100';
  }
  return errors;
}
