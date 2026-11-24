const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Client-side checks that mirror the backend's spend entry validation.
 * @param {{amount: string, spent_on: string, description: string}} values
 * @returns {Object<string, string>} Error message per invalid field.
 */
export default function validateBudgetEntry(values) {
  const errors = {};
  if (!AMOUNT.test(values.amount.trim())) errors.amount = 'Enter an amount of 0 or more, with at most 2 decimals';
  if (!values.spent_on) errors.spent_on = 'Date is required';
  if (values.description.length > 500) errors.description = 'Must be at most 500 characters';
  return errors;
}
