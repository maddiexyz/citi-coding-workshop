import { apiRequest } from './api';

/** @returns {Promise<Object>} Portfolio counts for the summary cards. */
export function getDashboardSummary() {
  return apiRequest('/dashboard/summary');
}

/**
 * Projects at risk and/or over budget, most severe first.
 * @param {{q?: string, flag?: 'at_risk'|'over_budget', severity?: 'high'|'medium'}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listAtRiskProjects(filters = {}) {
  const data = await apiRequest('/dashboard/at-risk', { query: filters });
  return data.items;
}
