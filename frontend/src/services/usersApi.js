import { apiRequest } from './api';

/**
 * List users (admin and project managers only), e.g. {role: 'team_lead', active: true}.
 * @param {{role?: string, active?: boolean, q?: string}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listUsers(filters = {}) {
  const data = await apiRequest('/users', { query: filters });
  return data.items;
}
