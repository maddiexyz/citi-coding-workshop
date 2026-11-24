import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import MyWorkPage from './MyWorkPage';
import renderWithProviders from '../test/renderWithProviders';
import homePath from '../auth/homePath';
import { listAllocations } from '../services/allocationsApi';
import { listAtRiskProjects } from '../services/dashboardApi';
import { listDeliverables } from '../services/deliverablesApi';
import { listProjects } from '../services/projectsApi';
import { getResource, getResourceLoad } from '../services/resourcesApi';

vi.mock('../services/allocationsApi', () => ({ listAllocations: vi.fn() }));
vi.mock('../services/dashboardApi', () => ({ listAtRiskProjects: vi.fn() }));
vi.mock('../services/deliverablesApi', () => ({ listDeliverables: vi.fn() }));
vi.mock('../services/projectsApi', () => ({ listProjects: vi.fn() }));
vi.mock('../services/resourcesApi', () => ({ getResource: vi.fn(), getResourceLoad: vi.fn() }));

const LEAD = { id: 5, role: 'team_lead', full_name: 'Lee Lead', resource_id: 3 };
const WEEK = (start, total, over) => ({ week_start: start, total_hours: total, weekly_hours: '40.00', over_by: over, projects: [] });
const DELIVERABLE = (id, title, flags) => ({ id, project_id: 1, project_code: 'P-1', title, status: 'in_progress',
  due_date: '2030-01-10', is_blocked: false, is_overdue: false, ...flags });

beforeEach(() => {
  getResource.mockResolvedValue({ id: 3, full_name: 'Lee Lead', weekly_hours: '40.00' });
  getResourceLoad.mockResolvedValue({ weeks: [WEEK('2030-01-07', '50.00', '10.00'), WEEK('2030-01-14', '20.00', '0')] });
  listAllocations.mockResolvedValue([
    { id: 1, project_id: 1, project_code: 'P-1', project_name: 'Platform', hours_per_week: '30.00', start_date: '2030-01-07', end_date: '2030-01-20' },
    { id: 2, project_id: 2, project_code: 'OLD', project_name: 'Old', hours_per_week: '5.00', start_date: '2029-01-01', end_date: '2029-02-01' },
  ]);
  listDeliverables.mockImplementation((filters) => Promise.resolve(
    filters.overdue ? [DELIVERABLE(1, 'Late spec', { is_overdue: true })]
      : filters.blocked ? [DELIVERABLE(2, 'Waiting on API', { is_blocked: true })] : [],
  ));
  listProjects.mockImplementation((filters) => Promise.resolve(filters.team_lead
    ? [{ id: 1, code: 'P-1', name: 'Platform', status: 'active', owner_id: 7, burn_pct: '120.0', over_budget: true }] : []));
  listAtRiskProjects.mockResolvedValue([{ id: 1, severity: 'high', risk_reasons: [{ type: 'late', message: 'Past its end date by 3 days' }] }]);
});

describe('MyWorkPage', () => {
  it('shows my allocations with the over-allocation warning, my deliverables and my projects', async () => {
    renderWithProviders(<MyWorkPage />, { user: LEAD });
    const allocations = await screen.findByRole('list', { name: 'My allocations' });
    expect(within(allocations).getByText('P-1 – Platform')).toBeInTheDocument();
    expect(within(allocations).queryByText('OLD – Old')).not.toBeInTheDocument();   // outside the 8 weeks
    expect(screen.getByText(/beyond your capacity in 1 of the next 8 weeks/)).toBeInTheDocument();
    expect(listAllocations).toHaveBeenCalledWith({ resource: 'me' });

    expect(await screen.findByRole('list', { name: 'Overdue' })).toHaveTextContent('Late spec');
    expect(screen.getByRole('list', { name: 'Blocked' })).toHaveTextContent('Waiting on API');
    expect(listDeliverables).toHaveBeenCalledWith({ assignee: 'me', due_soon: true });

    const projects = await screen.findByRole('list', { name: 'My projects' });
    expect(within(projects).getByText('P-1 · Team lead')).toBeInTheDocument();
    expect(within(projects).getByText('High risk')).toBeInTheDocument();
    expect(within(projects).getByText('120.0% · over budget')).toBeInTheDocument();
    expect(within(projects).getByText('Past its end date by 3 days')).toBeInTheDocument();
  });

  it('explains what to do when the account has no linked person', async () => {
    renderWithProviders(<MyWorkPage />, { user: { ...LEAD, resource_id: null } });
    expect(screen.getByText(/once an admin links your account to a person/)).toBeInTheDocument();
    expect(getResource).not.toHaveBeenCalled();
    expect(await screen.findByRole('list', { name: 'My projects' })).toBeInTheDocument();
  });

  it('shows empty states', async () => {
    listAllocations.mockResolvedValue([]);
    listDeliverables.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    renderWithProviders(<MyWorkPage />, { user: LEAD, width: 400 });
    expect(await screen.findByText('You have no allocations in the next 8 weeks.')).toBeInTheDocument();
    expect(await screen.findByText(/Nothing assigned to you is overdue/)).toBeInTheDocument();
    expect(await screen.findByText("You don't own or lead any projects.")).toBeInTheDocument();
  });

  it('shows each section\'s error on its own', async () => {
    listDeliverables.mockRejectedValue(new Error('Deliverables unavailable'));
    renderWithProviders(<MyWorkPage />, { user: LEAD });
    expect(await screen.findByText('Deliverables unavailable')).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'My projects' })).toBeInTheDocument();
  });
});

describe('homePath', () => {
  it('sends admins to the dashboard and everyone else to My work', () => {
    expect(homePath({ role: 'admin' })).toBe('/dashboard');
    expect(homePath({ role: 'viewer' })).toBe('/my-work');
    expect(homePath(null)).toBe('/my-work');
  });
});
