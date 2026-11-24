import { describe, expect, it } from 'vitest';
import { canChangeProject, canCreateProject } from './permissions';

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
