import { apiRequest } from './api';

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
