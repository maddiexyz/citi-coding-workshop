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
