import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetailPage from './ProjectDetailPage';
import renderWithProviders from '../test/renderWithProviders';
import { getProject } from '../services/projectsApi';

vi.mock('../services/projectsApi', () => ({ getProject: vi.fn() }));
vi.mock('../components/forecast/ForecastCard', () => ({ default: () => <p>forecast card</p> }));
vi.mock('../components/forecast/TimelinePanel', () => ({ default: () => <p>timeline panel</p> }));
vi.mock('../components/deliverables/DeliverablesPanel', () => ({ default: () => <p>deliverables panel</p> }));
vi.mock('../components/allocations/AllocationsPanel', () => ({ default: () => <p>allocations panel</p> }));
vi.mock('../components/budget/BudgetPanel', () => ({ default: () => <p>budget panel</p> }));
vi.mock('../components/audit/ActivityPanel', () => ({ default: () => <p>activity panel</p> }));

const PROJECT = {
  id: 3, code: 'WEB-1', name: 'Website', description: 'The new site', status: 'active', start_date: '2030-01-01',
  end_date: '2030-06-30', owner_id: 7, owner_name: 'Pat', team_lead_id: null, team_lead_name: null,
  deliverables_total: 4, deliverables_done: 1,
};

function open(user, path = '/projects/3') {
  getProject.mockResolvedValue(PROJECT);
  renderWithProviders(<ProjectDetailPage />, { user, path, route: '/projects/:id' });
}

describe('ProjectDetailPage', () => {
  it('shows the overview with progress', async () => {
    open({ id: 9, role: 'viewer' });
    expect(await screen.findByRole('heading', { name: 'Website' })).toBeInTheDocument();
    expect(screen.getByText('The new site')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 (25%)')).toBeInTheDocument();
    expect(screen.getByText('forecast card')).toBeInTheDocument();
  });

  it('hides Edit and Activity from viewers', async () => {
    open({ id: 9, role: 'viewer' });
    await screen.findByRole('heading', { name: 'Website' });
    expect(screen.queryByRole('link', { name: /edit project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Budget' })).toBeInTheDocument();
  });

  it('gives the owning PM Edit and Activity, and switches tabs', async () => {
    open({ id: 7, role: 'project_manager' });
    expect(await screen.findByRole('link', { name: /edit project/i })).toBeInTheDocument();
    expect(screen.getByText('Pat (you)')).toBeInTheDocument();
    for (const [tab, panel] of [['Deliverables', 'deliverables'], ['Allocations', 'allocations'],
      ['Budget', 'budget'], ['Activity', 'activity']]) {
      await userEvent.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByText(`${panel} panel`)).toBeInTheDocument();
    }
  });

  it('opens the tab named in the URL, falling back to the overview', async () => {
    open({ id: 9, role: 'viewer' }, '/projects/3?tab=budget');
    expect(await screen.findByText('budget panel')).toBeInTheDocument();
  });

  it('ignores a tab the user may not see', async () => {
    open({ id: 9, role: 'viewer' }, '/projects/3?tab=activity');
    expect(await screen.findByText('Deliverables done')).toBeInTheDocument();
    expect(screen.queryByText('activity panel')).not.toBeInTheDocument();
  });

  it('reports a missing project', async () => {
    getProject.mockRejectedValue(new Error('Project not found'));
    renderWithProviders(<ProjectDetailPage />, { user: { id: 9, role: 'viewer' }, path: '/projects/99', route: '/projects/:id' });
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
  });
});
