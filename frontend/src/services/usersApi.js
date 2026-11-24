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

/** @param {Object} user email, full_name, role, is_active, password @returns {Promise<Object>} */
export function createUser(user) {
  return apiRequest('/users', { method: 'POST', body: user });
}

/** @param {number} id @param {Object} user email, full_name, role, is_active @returns {Promise<Object>} */
export function updateUser(id, user) {
  return apiRequest(`/users/${id}`, { method: 'PUT', body: user });
}

/** @param {number} id @param {string} password @returns {Promise<null>} */
export function resetPassword(id, password) {
  return apiRequest(`/users/${id}/password`, { method: 'PUT', body: { password } });
}

/** @param {number} id @returns {Promise<null>} */
export function deleteUser(id) {
  return apiRequest(`/users/${id}`, { method: 'DELETE' });
}
