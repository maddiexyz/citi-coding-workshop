import { apiRequest } from './api';

/**
 * List allocations.
 * @param {{project_id?: number, resource_id?: number, active_on?: string}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listAllocations(filters = {}) {
  const data = await apiRequest('/allocations', { query: filters });
  return data.items;
}

/**
 * Create an allocation. The result includes `warnings` for weeks where the
 * person is now over-allocated (it is saved anyway).
 * @param {Object} allocation project_id, resource_id, hours_per_week, start_date, end_date, note.
 * @returns {Promise<Object>}
 */
export function createAllocation(allocation) {
  return apiRequest('/allocations', { method: 'POST', body: allocation });
}

/** @param {number|string} id @param {Object} allocation @returns {Promise<Object>} Including `warnings`. */
export function updateAllocation(id, allocation) {
  return apiRequest(`/allocations/${id}`, { method: 'PUT', body: allocation });
}

/** @param {number|string} id @returns {Promise<null>} */
export function deleteAllocation(id) {
  return apiRequest(`/allocations/${id}`, { method: 'DELETE' });
}
