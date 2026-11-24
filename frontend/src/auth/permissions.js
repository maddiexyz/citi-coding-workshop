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

/**
 * @param {{id: number, role: string}|null} user
 * @param {{team_lead_id?: number|null}} project
 * @returns {boolean} True if the user is the team lead assigned to the project.
 */
export function isAssignedTeamLead(user, project) {
  return user?.role === 'team_lead' && project.team_lead_id === user.id;
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number, team_lead_id?: number|null}} project
 * @returns {boolean} True if the user may create/edit deliverables and dependencies in the project.
 */
export function canEditDeliverables(user, project) {
  return canChangeProject(user, project) || isAssignedTeamLead(user, project);
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number}} project
 * @returns {boolean} True if the user may delete deliverables (admin or the owning PM, not the team lead).
 */
export function canDeleteDeliverables(user, project) {
  return canChangeProject(user, project);
}

/**
 * @param {{role: string}|null} user
 * @returns {boolean} True if the user may create, edit or delete resources (admin only).
 */
export function canManageResources(user) {
  return user?.role === 'admin';
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number}} project
 * @returns {boolean} True if the user may change allocations on the project (admin or the owning PM).
 */
export function canManageAllocations(user, project) {
  return canChangeProject(user, project);
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number, budget_entry_count?: number}} project
 * @returns {boolean} True if the user may delete the project (admin only once it has spend entries).
 */
export function canDeleteProject(user, project) {
  if (user?.role === 'admin') return true;
  return canChangeProject(user, project) && !(project.budget_entry_count > 0);
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number}} project
 * @returns {boolean} True if the user may see and change spend entries and the planned budget.
 */
export function canManageBudget(user, project) {
  return canChangeProject(user, project);
}

/**
 * @param {{role: string}|null} user
 * @returns {boolean} True if the user may delete spend entries (admin only).
 */
export function canDeleteBudgetEntries(user) {
  return user?.role === 'admin';
}

/**
 * @param {{id: number, role: string}|null} user
 * @param {{owner_id: number}} project
 * @returns {boolean} True if the user may read the project's change history.
 */
export function canReadProjectAudit(user, project) {
  return canChangeProject(user, project);
}
