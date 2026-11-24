/**
 * Role rules used to show or hide actions in the UI.
 *
 * These mirror backend/_common/permissions.py. They only decide what the
 * user sees: the backend enforces the same rules on every request.
 */

export const ROLE_LABELS = {
  admin: 'Admin',
  project_manager: 'Project manager',
  team_lead: 'Team lead',
  viewer: 'Viewer',
};

/**
 * @param {{role: string}|null} user The signed-in user.
 * @returns {boolean} True if the user may create projects.
 */
export function canCreateProject(user) {
  return user?.role === 'admin' || user?.role === 'project_manager';
}

/**
 * @param {{id: number, role: string}|null} user The signed-in user.
 * @param {{owner_id: number}} project The project.
 * @returns {boolean} True if the user may edit or delete the project.
 */
export function canChangeProject(user, project) {
  if (user?.role === 'admin') return true;
  return user?.role === 'project_manager' && project.owner_id === user.id;
}
