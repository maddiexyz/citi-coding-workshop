const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});

/**
 * Format a "YYYY-MM-DD" date for display.
 * Uses UTC so the calendar date never shifts with the viewer's time zone.
 * @param {string|null} isoDate
 * @returns {string} e.g. "Dec 1, 2026", or an em dash when empty.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  return DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));
}
