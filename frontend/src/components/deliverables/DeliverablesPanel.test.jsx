import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../../auth/authContext';
import DeliverablesPanel from './DeliverablesPanel';
import { listDeliverables } from '../../services/deliverablesApi';

vi.mock('../../services/deliverablesApi', () => ({
  listDeliverables: vi.fn(),
  deleteDeliverable: vi.fn(),
  getDeliverable: vi.fn(),
  createDeliverable: vi.fn(),
  updateDeliverable: vi.fn(),
  addDependency: vi.fn(),
  removeDependency: vi.fn(),
}));

const PROJECT = { id: 1, code: 'P-1', name: 'P', status: 'active', owner_id: 7, team_lead_id: 5 };
const ITEMS = [
  { id: 1, project_id: 1, title: 'Spec', status: 'in_progress', due_date: '2026-01-01',
    is_blocked: true, is_overdue: true, predecessor_count: 1, successor_count: 0 },
];

function renderAs(user, width = 1200, result = Promise.resolve(ITEMS)) {
  listDeliverables.mockReturnValue(result);
  const auth = { user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() };
  render(
    <ResponsiveContext.Provider value={{ width }}>
      <AuthContext.Provider value={auth}>
        <DeliverablesPanel project={PROJECT} onChanged={vi.fn()} />
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}

describe('DeliverablesPanel', () => {
  it('shows the computed flags', async () => {
    renderAs({ id: 7, role: 'project_manager' });
    const table = await screen.findByRole('table', { name: 'Deliverables' });
    expect(within(table).getByText('Blocked')).toBeInTheDocument();
    expect(within(table).getByText('Overdue')).toBeInTheDocument();
  });

  it('lets the owning PM add and delete', async () => {
    renderAs({ id: 7, role: 'project_manager' });
    expect(await screen.findByRole('button', { name: 'Delete Spec' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new deliverable/i })).toBeInTheDocument();
  });

  it('lets the assigned team lead add but not delete', async () => {
    renderAs({ id: 5, role: 'team_lead' });
    expect(await screen.findByText('Spec')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new deliverable/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Spec' })).not.toBeInTheDocument();
  });

  it('shows no write actions to a viewer, on mobile cards too', async () => {
    renderAs({ id: 9, role: 'viewer' }, 400);
    expect(await screen.findByRole('list', { name: 'Deliverables' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new deliverable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Spec' })).not.toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    renderAs({ id: 9, role: 'viewer' }, 1200, Promise.resolve([]));
    expect(await screen.findByText('No deliverables yet.')).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    renderAs({ id: 9, role: 'viewer' }, 1200, Promise.reject(new Error('Cannot reach the server.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});
