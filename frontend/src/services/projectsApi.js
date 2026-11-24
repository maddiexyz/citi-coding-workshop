import { apiRequest } from './api';

/**
 * List projects.
 * @param {{status?: string, q?: string}} [filters] Status filter and search text.
 * @returns {Promise<Array<Object>>} The matching projects.
 */
export async function listProjects(filters = {}) {
  const data = await apiRequest('/projects', { query: filters });
  return data.items;
}

/**
 * Fetch one project.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export function getProject(id) {
  return apiRequest(`/projects/${id}`);
}

/**
 * Create a project.
 * @param {Object} project Editable project fields.
 * @returns {Promise<Object>} The created project.
 */
export function createProject(project) {
  return apiRequest('/projects', { method: 'POST', body: project });
}

/**
 * Update a project.
 * @param {number|string} id
 * @param {Object} project Editable project fields.
 * @returns {Promise<Object>} The updated project.
 */
export function updateProject(id, project) {
  return apiRequest(`/projects/${id}`, { method: 'PUT', body: project });
}

/**
 * Delete a project.
 * @param {number|string} id
 * @returns {Promise<null>}
 */
export function deleteProject(id) {
  return apiRequest(`/projects/${id}`, { method: 'DELETE' });
}
