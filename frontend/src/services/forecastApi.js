import { apiRequest } from './api';

const OPEN_STATUSES = ['planned', 'active', 'on_hold'];
const FORECAST_STATUSES = ['on_track', 'late'];

/**
 * A project's completion forecast, computed by the backend with the critical
 * path method: forecast_end, planned_end, slip_days, status, confidence, spi,
 * critical_path (deliverable ids in order) and one item per deliverable.
 * @param {number|string} projectId
 * @returns {Promise<Object>}
 */
export function getForecast(projectId) {
  return apiRequest(`/projects/${projectId}/forecast`);
}

/**
 * Ids of the deliverables on a forecast's critical path (no float).
 * @param {{items: Array<{id: number, critical: boolean}>}} forecast
 * @returns {Set<number>}
 */
export function criticalIds(forecast) {
  return new Set(forecast.items.filter((item) => item.critical).map((item) => item.id));
}

/**
 * True when a project in a list has a forecast worth showing: it is still
 * open and the backend could forecast it (its remaining work has estimates).
 * @param {{status: string, forecast_status?: string}} project
 * @returns {boolean}
 */
export function hasForecast(project) {
  return OPEN_STATUSES.includes(project.status) && FORECAST_STATUSES.includes(project.forecast_status);
}
