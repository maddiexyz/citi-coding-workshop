import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../../auth/authContext';
import AllocationsPanel from './AllocationsPanel';
import { createAllocation, listAllocations } from '../../services/allocationsApi';
import { listResources } from '../../services/resourcesApi';

vi.mock('../../services/allocationsApi', () => ({
  listAllocations: vi.fn(), createAllocation: vi.fn(), updateAllocation: vi.fn(), deleteAllocation: vi.fn(),
}));
vi.mock('../../services/resourcesApi', () => ({ listResources: vi.fn() }));

const PROJECT = { id: 1, code: 'P-1', name: 'P', status: 'active', owner_id: 7, team_lead_id: 5,
  start_date: '2030-01-01', end_date: '2030-12-31' };
const PAT = { id: 3, full_name: 'Pat', weekly_hours: '40.00', week_hours: '50.00', over_allocated: true, is_active: true };
const ALLOCATION = { id: 9, project_id: 1, resource_id: 3, resource_name: 'Pat', hours_per_week: '30.00',
  start_date: '2030-01-07', end_date: '2030-01-13', note: null };

function renderAs(user) {
  listAllocations.mockResolvedValue([ALLOCATION]);
  listResources.mockResolvedValue({ items: [PAT], week_start: '2030-01-07' });
  render(
    <ResponsiveContext.Provider value={{ width: 1200 }}>
      <AuthContext.Provider value={{ user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() }}>
        <MemoryRouter><AllocationsPanel project={PROJECT} /></MemoryRouter>
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}

describe('AllocationsPanel', () => {
  it('flags people over-allocated this week', async () => {
    renderAs({ id: 9, role: 'viewer' });
    expect(await screen.findByText(/Over-allocated this week: Pat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();
  });

  it('keeps the assigned team lead read-only', async () => {
    renderAs({ id: 5, role: 'team_lead' });
    expect(await screen.findByRole('table', { name: 'Allocations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Pat' })).not.toBeInTheDocument();
  });

  it('warns after a save that over-allocates, without blocking it', async () => {
    createAllocation.mockResolvedValue({ ...ALLOCATION, id: 10, warnings: [
      { week_start: '2030-01-07', total_hours: '50.00', weekly_hours: '40.00', over_by: '10.00' }] });
    renderAs({ id: 7, role: 'project_manager' });
    await userEvent.click(await screen.findByRole('button', { name: 'Allocate' }));
    await userEvent.click(screen.getByRole('combobox', { name: /person/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Pat/ }));
    await userEvent.type(screen.getByLabelText(/hours per week/i), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(createAllocation).toHaveBeenCalledWith(expect.objectContaining({ project_id: 1, resource_id: 3, hours_per_week: '20' }));
    expect(await screen.findByText(/Saved, but Pat is over-allocated/)).toBeInTheDocument();
  });
});
