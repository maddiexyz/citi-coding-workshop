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

/**
 * Describe deliverable progress, e.g. "3 / 5 done".
 * @param {{deliverables_done?: number, deliverables_total?: number}} project
 * @returns {string} The progress text, or "No deliverables".
 */
export function formatProgress(project) {
  const total = project.deliverables_total ?? 0;
  if (!total) return 'No deliverables';
  return `${project.deliverables_done ?? 0} / ${total} done`;
}

/**
 * Format hours, e.g. "37.5 h" (API decimals arrive as strings like "37.50").
 * @param {string|number|null} hours
 * @returns {string}
 */
export function formatHours(hours) {
  if (hours === null || hours === undefined || hours === '') return '—';
  return `${Number(hours).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
}

/**
 * Label for a Monday-based week, e.g. "Week of Jan 6, 2030".
 * @param {string} weekStart "YYYY-MM-DD"
 * @returns {string}
 */
export function formatWeek(weekStart) {
  return `Week of ${formatDate(weekStart)}`;
}
