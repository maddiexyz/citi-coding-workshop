import { apiRequest } from './api';

/**
 * Change history, newest first (admin; the owning PM for their project).
 * @param {{project_id?: number, entity_type?: string, limit?: number}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listAudit(filters = {}) {
  const data = await apiRequest('/audit', { query: filters });
  return data.items;
}
