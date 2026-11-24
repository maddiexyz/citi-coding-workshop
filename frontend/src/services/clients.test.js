import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as allocations from './allocationsApi';
import * as audit from './auditApi';
import * as auth from './authApi';
import * as budget from './budgetApi';
import * as dashboard from './dashboardApi';
import * as deliverables from './deliverablesApi';
import * as projects from './projectsApi';
import * as resources from './resourcesApi';
import * as users from './usersApi';

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: () => Promise.resolve({ items: ['x'], token: 't', user: {} }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/** The [method, path?query, JSON body] of the last request. */
function lastCall() {
  const [url, options] = fetchMock.mock.calls.at(-1);
  const { pathname, search } = new URL(url);
  return [options.method, `${pathname.replace(/^\/api/, '')}${search}`, options.body ? JSON.parse(options.body) : undefined];
}

describe('API clients call the documented endpoints', () => {
  it.each([
    ['listProjects', () => projects.listProjects({ status: 'active' }), ['GET', '/projects?status=active', undefined]],
    ['getProject', () => projects.getProject(3), ['GET', '/projects/3', undefined]],
    ['createProject', () => projects.createProject({ code: 'A' }), ['POST', '/projects', { code: 'A' }]],
    ['updateProject', () => projects.updateProject(3, { code: 'A' }), ['PUT', '/projects/3', { code: 'A' }]],
    ['deleteProject', () => projects.deleteProject(3), ['DELETE', '/projects/3', undefined]],
    ['listDeliverables', () => deliverables.listDeliverables({ project_id: 1, blocked: true }),
      ['GET', '/deliverables?project_id=1&blocked=true', undefined]],
    ['getDeliverable', () => deliverables.getDeliverable(4), ['GET', '/deliverables/4', undefined]],
    ['createDeliverable', () => deliverables.createDeliverable({ title: 'T' }), ['POST', '/deliverables', { title: 'T' }]],
    ['updateDeliverable', () => deliverables.updateDeliverable(4, { title: 'T' }), ['PUT', '/deliverables/4', { title: 'T' }]],
    ['deleteDeliverable', () => deliverables.deleteDeliverable(4), ['DELETE', '/deliverables/4', undefined]],
    ['addDependency', () => deliverables.addDependency(4, 5), ['POST', '/deliverables/4/dependencies', { depends_on_id: 5 }]],
    ['removeDependency', () => deliverables.removeDependency(4, 5), ['DELETE', '/deliverables/4/dependencies/5', undefined]],
    ['listResources', () => resources.listResources({ over_allocated: true }), ['GET', '/resources?over_allocated=true', undefined]],
    ['getResource', () => resources.getResource(2), ['GET', '/resources/2', undefined]],
    ['getResourceLoad', () => resources.getResourceLoad(2, { from: '2030-01-07' }), ['GET', '/resources/2/load?from=2030-01-07', undefined]],
    ['createResource', () => resources.createResource({ full_name: 'P' }), ['POST', '/resources', { full_name: 'P' }]],
    ['updateResource', () => resources.updateResource(2, { full_name: 'P' }), ['PUT', '/resources/2', { full_name: 'P' }]],
    ['deleteResource', () => resources.deleteResource(2), ['DELETE', '/resources/2', undefined]],
    ['listAllocations', () => allocations.listAllocations({ project_id: 1 }), ['GET', '/allocations?project_id=1', undefined]],
    ['createAllocation', () => allocations.createAllocation({ hours_per_week: '5' }), ['POST', '/allocations', { hours_per_week: '5' }]],
    ['updateAllocation', () => allocations.updateAllocation(6, { hours_per_week: '5' }), ['PUT', '/allocations/6', { hours_per_week: '5' }]],
    ['deleteAllocation', () => allocations.deleteAllocation(6), ['DELETE', '/allocations/6', undefined]],
    ['getBudgetSummary', () => budget.getBudgetSummary(1), ['GET', '/budget/summary?project_id=1', undefined]],
    ['listBudgetEntries', () => budget.listBudgetEntries(1, { category: 'labor' }), ['GET', '/budget?category=labor&project_id=1', undefined]],
    ['createBudgetEntry', () => budget.createBudgetEntry({ amount: '1' }), ['POST', '/budget', { amount: '1' }]],
    ['updateBudgetEntry', () => budget.updateBudgetEntry(7, { amount: '1' }), ['PUT', '/budget/7', { amount: '1' }]],
    ['deleteBudgetEntry', () => budget.deleteBudgetEntry(7), ['DELETE', '/budget/7', undefined]],
    ['listAudit', () => audit.listAudit({ project_id: 1 }), ['GET', '/audit?project_id=1', undefined]],
    ['getDashboardSummary', () => dashboard.getDashboardSummary(), ['GET', '/dashboard/summary', undefined]],
    ['listAtRiskProjects', () => dashboard.listAtRiskProjects({ flag: 'at_risk' }), ['GET', '/dashboard/at-risk?flag=at_risk', undefined]],
    ['listUsers', () => users.listUsers({ role: 'team_lead' }), ['GET', '/users?role=team_lead', undefined]],
    ['createUser', () => users.createUser({ email: 'e' }), ['POST', '/users', { email: 'e' }]],
    ['updateUser', () => users.updateUser(8, { email: 'e' }), ['PUT', '/users/8', { email: 'e' }]],
    ['resetPassword', () => users.resetPassword(8, 'pw-long-enough'), ['PUT', '/users/8/password', { password: 'pw-long-enough' }]],
    ['deleteUser', () => users.deleteUser(8), ['DELETE', '/users/8', undefined]],
    ['login', () => auth.login('a@b.co', 'pw'), ['POST', '/auth/login', { email: 'a@b.co', password: 'pw' }]],
    ['fetchCurrentUser', () => auth.fetchCurrentUser(), ['GET', '/auth/me', undefined]],
    ['logout', () => auth.logout(), ['POST', '/auth/logout', undefined]],
  ])('%s', async (_name, run, expected) => {
    await run();
    expect(lastCall()).toEqual(expected);
  });

  it('list helpers return the items array', async () => {
    await expect(projects.listProjects()).resolves.toEqual(['x']);
    await expect(users.listUsers()).resolves.toEqual(['x']);
  });
});
