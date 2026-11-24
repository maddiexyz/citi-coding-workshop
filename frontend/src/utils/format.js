// Indian conventions throughout: "1 Dec 2026", "₹1,20,000.00", "1,20,000"
export const LOCALE = 'en-IN';

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});

/**
 * Format a "YYYY-MM-DD" date for display.
 * Uses UTC so the calendar date never shifts with the viewer's time zone.
 * @param {string|null} isoDate
 * @returns {string} e.g. "1 Dec 2026", or an em dash when empty.
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
  return `${Number(hours).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} h`;
}

/**
 * Label for a Monday-based week, e.g. "Week of 7 Jan 2030".
 * @param {string} weekStart "YYYY-MM-DD"
 * @returns {string}
 */
export function formatWeek(weekStart) {
  return `Week of ${formatDate(weekStart)}`;
}

/**
 * Format an amount of money. API amounts arrive as exact decimal strings
 * ("1234.50"); they are only converted to a number here, for display.
 * @param {string|number|null} amount
 * @param {string} [currency] ISO 4217 code from the API (default INR).
 * @returns {string} e.g. "₹1,20,000.00" (Indian digit grouping), or an em dash when empty.
 */
export function formatMoney(amount, currency = 'INR') {
  if (amount === null || amount === undefined || amount === '') return '—';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(Number(amount));
}

/**
 * Format a timestamp, e.g. "15 Jan 2030, 3:30 pm" (shown in the viewer's time zone).
 * @param {string} isoTimestamp
 * @returns {string}
 */
export function formatDateTime(isoTimestamp) {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoTimestamp));
}
