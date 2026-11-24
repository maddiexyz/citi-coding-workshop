/** Spend categories, matching the backend's spend_category enum. */
export const SPEND_CATEGORIES = [
  { value: 'labor', label: 'Labor' },
  { value: 'software', label: 'Software' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

/** @param {string} value @returns {string} The display label. */
export function categoryLabel(value) {
  return SPEND_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
