import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Context as ResponsiveContext } from 'react-responsive';
import DashboardPage from './DashboardPage';
import { getDashboardSummary, listAtRiskProjects } from '../services/dashboardApi';

vi.mock('../services/departmentsApi', () => ({ listDepartments: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/dashboardApi', () => ({ getDashboardSummary: vi.fn(), listAtRiskProjects: vi.fn() }));

const SUMMARY = {
  active_projects: 4, at_risk: 2, high_risk: 1, over_budget: 1, overdue_deliverables: 3, blocked_deliverables: 1,
  over_allocated_people: [{ id: 5, full_name: 'Busy Bee', total_hours: '50.00', weekly_hours: '40.00', over_by: '10.00' }],
  projects_by_status: [], week_start: '2030-01-07',
};
const LATE = {
  id: 1, code: 'LATE-1', name: 'Late one', status: 'active', end_date: '2030-01-01', severity: 'high', is_at_risk: true,
  over_budget: false, burn_pct: null,
  risk_reasons: [
    { type: 'late', severity: 'high', message: 'Past its end date by 3 days', details: { days_late: 3 } },
    { type: 'overdue_deliverable', severity: 'medium', message: '1 overdue deliverable',
      details: { deliverables: [{ id: 9, title: 'Spec', due_date: '2029-12-30' }] } },
  ],
};
const SPENT = { id: 2, code: 'BUD-1', name: 'Spendy', status: 'active', end_date: null, severity: null, is_at_risk: false,
  over_budget: true, burn_pct: '120.0', risk_reasons: [] };

function renderPage(width = 1200) {
  getDashboardSummary.mockResolvedValue(SUMMARY);
  listAtRiskProjects.mockResolvedValue([LATE, SPENT]);
  render(
    <ResponsiveContext.Provider value={{ width }}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </ResponsiveContext.Provider>,
  );
}

describe('DashboardPage', () => {
  it('shows the summary cards', async () => {
    renderPage();
    expect(await screen.findByText('Active projects')).toBeInTheDocument();
    expect(screen.getByText('1 past their end date')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Over-allocated people' })).toHaveTextContent('Busy Bee – 50 h of 40 h');
  });

  it('explains why each project is flagged', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Projects at risk' });
    expect(within(list).getByText('High risk')).toBeInTheDocument();
    expect(within(list).getByText('Past its end date by 3 days')).toBeInTheDocument();
    expect(within(list).getByText(/Spec \(due/)).toBeInTheDocument();
    expect(within(list).getByText('120.0% · over budget')).toBeInTheDocument();   // separate flag
    expect(within(list).getByText(/Over budget: 120.0% of the planned budget spent/)).toBeInTheDocument();
  });

  it('shows when the data was updated and refreshes on demand', async () => {
    renderPage();
    expect(await screen.findByText(/^Updated \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(getDashboardSummary).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await vi.waitFor(() => expect(getDashboardSummary).toHaveBeenCalledTimes(2));
    expect(listAtRiskProjects).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('list', { name: 'Projects at risk' })).toBeInTheDocument();   // no spinner flash
  });

  it('shows the empty state', async () => {
    getDashboardSummary.mockResolvedValue(SUMMARY);
    listAtRiskProjects.mockResolvedValue([]);
    render(<ResponsiveContext.Provider value={{ width: 400 }}><MemoryRouter><DashboardPage /></MemoryRouter></ResponsiveContext.Provider>);
    expect(await screen.findByText(/No projects are at risk or over budget/)).toBeInTheDocument();
  });
});
