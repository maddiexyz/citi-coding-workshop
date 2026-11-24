import { apiRequest } from './api';

/**
 * List resources with their load in one week.
 * @param {{q?: string, department?: string, active?: boolean, over_allocated?: boolean, week?: string}} [filters]
 * @returns {Promise<{items: Array<Object>, week_start: string}>}
 */
export function listResources(filters = {}) {
  return apiRequest('/resources', { query: filters });
}

/** @param {number|string} id @returns {Promise<Object>} The resource with its allocations. */
export function getResource(id) {
  return apiRequest(`/resources/${id}`);
}

/**
 * Hours allocated per week.
 * @param {number|string} id
 * @param {{from?: string, to?: string}} [range] Defaults to this week and the next 7.
 * @returns {Promise<{weeks: Array<Object>}>}
 */
export function getResourceLoad(id, range = {}) {
  return apiRequest(`/resources/${id}/load`, { query: range });
}

/** @param {Object} resource @returns {Promise<Object>} */
export function createResource(resource) {
  return apiRequest('/resources', { method: 'POST', body: resource });
}

/** @param {number|string} id @param {Object} resource @returns {Promise<Object>} */
export function updateResource(id, resource) {
  return apiRequest(`/resources/${id}`, { method: 'PUT', body: resource });
}

/** @param {number|string} id @returns {Promise<null>} */
export function deleteResource(id) {
  return apiRequest(`/resources/${id}`, { method: 'DELETE' });
}
