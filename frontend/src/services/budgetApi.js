import { apiRequest } from './api';

/**
 * Planned vs actual for a project (everyone may read it).
 * @param {number} projectId
 * @returns {Promise<Object>} budget_planned, actual, remaining, burn_pct, over_budget, budget_set, by_category, currency.
 */
export function getBudgetSummary(projectId) {
  return apiRequest('/budget/summary', { query: { project_id: projectId } });
}

/**
 * Spend entries of a project (admin and the owning PM).
 * @param {number} projectId
 * @param {{category?: string, from?: string, to?: string, q?: string}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listBudgetEntries(projectId, filters = {}) {
  const data = await apiRequest('/budget', { query: { ...filters, project_id: projectId } });
  return data.items;
}

/** @param {Object} entry project_id, category, amount, spent_on, description @returns {Promise<Object>} */
export function createBudgetEntry(entry) {
  return apiRequest('/budget', { method: 'POST', body: entry });
}

/** @param {number} id @param {Object} entry @returns {Promise<Object>} */
export function updateBudgetEntry(id, entry) {
  return apiRequest(`/budget/${id}`, { method: 'PUT', body: entry });
}

/** @param {number} id @returns {Promise<null>} */
export function deleteBudgetEntry(id) {
  return apiRequest(`/budget/${id}`, { method: 'DELETE' });
}
