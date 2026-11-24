import { describe, expect, it } from 'vitest';
import {
  canChangeProject, canCreateProject, canDeleteDeliverables, canEditDeliverables, canManageAllocations,
  canManageResources, isAssignedTeamLead, canDeleteProject, canManageBudget, canDeleteBudgetEntries,
  canReadProjectAudit,
} from './permissions';

const project = { owner_id: 1 };

describe('canCreateProject', () => {
  it.each([
    ['admin', true], ['project_manager', true], ['team_lead', false], ['viewer', false],
  ])('%s -> %s', (role, expected) => {
    expect(canCreateProject({ id: 1, role })).toBe(expected);
  });

  it('is false when nobody is signed in', () => {
    expect(canCreateProject(null)).toBe(false);
  });
});

describe('canChangeProject', () => {
  it('lets admins change any project', () => {
    expect(canChangeProject({ id: 2, role: 'admin' }, project)).toBe(true);
  });

  it('lets project managers change only their own projects', () => {
    expect(canChangeProject({ id: 1, role: 'project_manager' }, project)).toBe(true);
    expect(canChangeProject({ id: 2, role: 'project_manager' }, project)).toBe(false);
  });

  it('keeps team leads and viewers read-only, even as owner', () => {
    expect(canChangeProject({ id: 1, role: 'team_lead' }, project)).toBe(false);
    expect(canChangeProject({ id: 1, role: 'viewer' }, project)).toBe(false);
  });
});

describe('deliverable permissions', () => {
  const led = { owner_id: 1, team_lead_id: 5 };

  it.each([
    ['admin', 9, true, true],
    ['project_manager', 1, true, true],     // owner
    ['project_manager', 2, false, false],   // someone else's project
    ['team_lead', 5, true, false],          // assigned: edit but not delete
    ['team_lead', 6, false, false],         // not assigned
    ['viewer', 5, false, false],
  ])('%s #%s -> edit %s, delete %s', (role, id, edit, remove) => {
    const user = { id, role };
    expect(canEditDeliverables(user, led)).toBe(edit);
    expect(canDeleteDeliverables(user, led)).toBe(remove);
  });

  it('only counts a team lead as assigned on their own project', () => {
    expect(isAssignedTeamLead({ id: 5, role: 'team_lead' }, led)).toBe(true);
    expect(isAssignedTeamLead({ id: 5, role: 'team_lead' }, { owner_id: 1, team_lead_id: null })).toBe(false);
  });
});

describe('resource and allocation permissions', () => {
  const project = { owner_id: 1, team_lead_id: 5 };

  it.each([
    ['admin', 9, true, true],
    ['project_manager', 1, false, true],
    ['project_manager', 2, false, false],
    ['team_lead', 5, false, false],
    ['viewer', 3, false, false],
  ])('%s #%s -> resources %s, allocations %s', (role, id, resources, allocations) => {
    expect(canManageResources({ id, role })).toBe(resources);
    expect(canManageAllocations({ id, role }, project)).toBe(allocations);
  });
});

describe('budget, audit and project delete permissions', () => {
  const project = { owner_id: 1, budget_entry_count: 0 };
  const spent = { owner_id: 1, budget_entry_count: 2 };

  it('lets the owning PM delete a project only while it has no spend entries', () => {
    expect(canDeleteProject({ id: 1, role: 'project_manager' }, project)).toBe(true);
    expect(canDeleteProject({ id: 1, role: 'project_manager' }, spent)).toBe(false);
    expect(canDeleteProject({ id: 9, role: 'admin' }, spent)).toBe(true);
  });

  it.each([
    ['admin', 9, true, true, true],
    ['project_manager', 1, true, false, true],
    ['project_manager', 2, false, false, false],
    ['team_lead', 1, false, false, false],
    ['viewer', 1, false, false, false],
  ])('%s #%s -> manage %s, delete entries %s, audit %s', (role, id, manage, remove, auditable) => {
    const user = { id, role };
    expect(canManageBudget(user, project)).toBe(manage);
    expect(canDeleteBudgetEntries(user)).toBe(remove);
    expect(canReadProjectAudit(user, project)).toBe(auditable);
  });
});
