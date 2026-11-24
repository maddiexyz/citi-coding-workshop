import { apiRequest } from './api';

/**
 * List deliverables.
 * @param {{project_id?: number, status?: string, q?: string, blocked?: boolean, overdue?: boolean}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listDeliverables(filters = {}) {
  const data = await apiRequest('/deliverables', { query: filters });
  return data.items;
}

/**
 * Fetch one deliverable with its predecessors and successors.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export function getDeliverable(id) {
  return apiRequest(`/deliverables/${id}`);
}

/**
 * Create a deliverable.
 * @param {Object} deliverable project_id, title, description, status, due_date.
 * @returns {Promise<Object>}
 */
export function createDeliverable(deliverable) {
  return apiRequest('/deliverables', { method: 'POST', body: deliverable });
}

/**
 * Update a deliverable.
 * @param {number|string} id
 * @param {Object} deliverable title, description, status, due_date.
 * @returns {Promise<Object>}
 */
export function updateDeliverable(id, deliverable) {
  return apiRequest(`/deliverables/${id}`, { method: 'PUT', body: deliverable });
}

/**
 * Delete a deliverable.
 * @param {number|string} id
 * @returns {Promise<null>}
 */
export function deleteDeliverable(id) {
  return apiRequest(`/deliverables/${id}`, { method: 'DELETE' });
}

/**
 * Record that a deliverable depends on another one (same project).
 * @param {number|string} id The dependent deliverable.
 * @param {number} dependsOnId The deliverable it waits for.
 * @returns {Promise<Object>} The updated deliverable.
 */
export function addDependency(id, dependsOnId) {
  return apiRequest(`/deliverables/${id}/dependencies`, { method: 'POST', body: { depends_on_id: dependsOnId } });
}

/**
 * Remove a dependency.
 * @param {number|string} id
 * @param {number|string} dependsOnId
 * @returns {Promise<null>}
 */
export function removeDependency(id, dependsOnId) {
  return apiRequest(`/deliverables/${id}/dependencies/${dependsOnId}`, { method: 'DELETE' });
}

/**
 * The project's dependency chains: nodes (deliverables) and rows in display
 * order, each with its depth in the tree.
 * @param {number} projectId
 * @returns {Promise<{nodes: Array<Object>, rows: Array<{id: number, depth: number, path: number[]}>}>}
 */
export function getChain(projectId) {
  return apiRequest('/deliverables/chain', { query: { project_id: projectId } });
}
