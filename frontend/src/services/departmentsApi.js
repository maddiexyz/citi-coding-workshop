import { apiRequest } from './api';

/**
 * List departments (everyone), with resource_count and project_count.
 * @param {{q?: string}} [filters]
 * @returns {Promise<Array<Object>>}
 */
export async function listDepartments(filters = {}) {
  const data = await apiRequest('/departments', { query: filters });
  return data.items;
}

/** @param {string} name @returns {Promise<Object>} */
export function createDepartment(name) {
  return apiRequest('/departments', { method: 'POST', body: { name } });
}

/** @param {number} id @param {string} name @returns {Promise<Object>} */
export function renameDepartment(id, name) {
  return apiRequest(`/departments/${id}`, { method: 'PUT', body: { name } });
}

/** @param {number} id @returns {Promise<null>} 409 while people or projects use it. */
export function deleteDepartment(id) {
  return apiRequest(`/departments/${id}`, { method: 'DELETE' });
}
