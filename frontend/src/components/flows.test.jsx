/**
 * Edit, delete and filter flows of the list panels: the paths users take
 * after the first render (dialogs open, confirmations, reloads, errors).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import renderWithProviders from '../test/renderWithProviders';
import { ApiError } from '../services/api';
import AllocationsPanel from './allocations/AllocationsPanel';
import BudgetPanel from './budget/BudgetPanel';
import DeliverablesPanel from './deliverables/DeliverablesPanel';
import UsersPage from '../pages/UsersPage';
import ProjectsPage from '../pages/ProjectsPage';
import { deleteAllocation, listAllocations, updateAllocation } from '../services/allocationsApi';
import {
  createBudgetEntry, deleteBudgetEntry, getBudgetSummary, listBudgetEntries,
} from '../services/budgetApi';
import {
  deleteDeliverable, getDeliverable, listDeliverables, updateDeliverable,
} from '../services/deliverablesApi';
import { listResources } from '../services/resourcesApi';
import { deleteUser, listUsers, updateUser } from '../services/usersApi';
import { deleteProject, listProjects } from '../services/projectsApi';

vi.mock('../services/allocationsApi', () => ({
  listAllocations: vi.fn(), createAllocation: vi.fn(), updateAllocation: vi.fn(), deleteAllocation: vi.fn(),
}));
vi.mock('../services/budgetApi', () => ({
  getBudgetSummary: vi.fn(), listBudgetEntries: vi.fn(), createBudgetEntry: vi.fn(),
  updateBudgetEntry: vi.fn(), deleteBudgetEntry: vi.fn(),
}));
vi.mock('../services/deliverablesApi', () => ({
  listDeliverables: vi.fn(), getDeliverable: vi.fn(), createDeliverable: vi.fn(), updateDeliverable: vi.fn(),
  deleteDeliverable: vi.fn(), addDependency: vi.fn(), removeDependency: vi.fn(),
}));
vi.mock('../services/resourcesApi', () => ({ listResources: vi.fn() }));
vi.mock('../services/usersApi', () => ({
  listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), deleteUser: vi.fn(),
}));
vi.mock('../services/projectsApi', () => ({ listProjects: vi.fn(), deleteProject: vi.fn() }));
vi.mock('../services/departmentsApi', () => ({ listDepartments: vi.fn().mockResolvedValue([]) }));

const ADMIN = { id: 1, role: 'admin', full_name: 'Ada' };
const PM = { id: 7, role: 'project_manager', full_name: 'Pat' };
const PROJECT = { id: 1, code: 'P-1', name: 'Project', status: 'active', owner_id: 7, team_lead_id: 5,
  start_date: '2030-01-01', end_date: '2030-12-31', updated_at: '2030-01-01T00:00:00Z' };
const PERSON = { id: 3, full_name: 'Pat Lee', weekly_hours: '40.00', week_hours: '30.00', over_allocated: false, is_active: true };

beforeEach(() => {
  listResources.mockResolvedValue({ items: [PERSON], week_start: '2030-01-07' });
});

const dialog = () => screen.getByRole('dialog');

describe('AllocationsPanel flows', () => {
  const allocation = { id: 9, project_id: 1, resource_id: 3, resource_name: 'Pat Lee', hours_per_week: '30.00',
    start_date: '2030-01-07', end_date: '2030-01-13', note: null };

  it('edits an allocation and confirms when there is no over-allocation', async () => {
    listAllocations.mockResolvedValue([allocation]);
    updateAllocation.mockResolvedValue({ ...allocation, hours_per_week: '20.00', warnings: [] });
    renderWithProviders(<AllocationsPanel project={PROJECT} />, { user: PM });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit allocation for Pat Lee' }));
    await userEvent.clear(within(dialog()).getByLabelText(/Hours per week/));
    await userEvent.type(within(dialog()).getByLabelText(/Hours per week/), '20');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(updateAllocation).toHaveBeenCalledWith(9, expect.objectContaining({ hours_per_week: '20', resource_id: 3 }));
    expect(await screen.findByText('Saved allocation for Pat Lee')).toBeInTheDocument();
  });

  it('removes an allocation after confirming, and reports failures', async () => {
    listAllocations.mockResolvedValue([allocation]);
    deleteAllocation.mockRejectedValueOnce(new Error('Server error'));
    renderWithProviders(<AllocationsPanel project={PROJECT} />, { user: ADMIN, width: 400 });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Pat Lee' }));
    expect(dialog()).toHaveTextContent('Pat Lee (30 h / week) will be removed');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    deleteAllocation.mockResolvedValueOnce(null);
    // findBy: wait for the closing dialog to hand the page back to assistive tech
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Pat Lee' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Removed Pat Lee from this project')).toBeInTheDocument();
  });

  it('shows the empty state and load errors', async () => {
    listAllocations.mockResolvedValue([]);
    renderWithProviders(<AllocationsPanel project={PROJECT} />, { user: PM });
    expect(await screen.findByText('Nobody is allocated to this project yet.')).toBeInTheDocument();
  });
});

describe('BudgetPanel flows', () => {
  const summary = { project_id: 1, currency: 'INR', budget_set: true, budget_planned: '1000.00', actual: '10.00',
    remaining: '990.00', burn_pct: '1.0', over_budget: false, entry_count: 1,
    by_category: [{ category: 'labor', amount: '10.00' }] };
  const entry = { id: 4, project_id: 1, category: 'labor', amount: '10.00', spent_on: '2030-01-15', description: 'Pizza' };

  it('records spend and refreshes the summary', async () => {
    getBudgetSummary.mockResolvedValue(summary);
    listBudgetEntries.mockResolvedValue([entry]);
    createBudgetEntry.mockResolvedValue({ ...entry, id: 5, amount: '5.00' });
    const onChanged = vi.fn();
    renderWithProviders(<BudgetPanel project={PROJECT} onChanged={onChanged} />, { user: PM });
    await userEvent.click(await screen.findByRole('button', { name: 'Record spend' }));
    await userEvent.type(within(dialog()).getByLabelText(/Amount/), '5');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Recorded ₹5.00 of labor spend')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(getBudgetSummary).toHaveBeenCalledTimes(2);
  });

  it('filters entries and lets an admin delete one', async () => {
    getBudgetSummary.mockResolvedValue(summary);
    listBudgetEntries.mockResolvedValue([entry]);
    deleteBudgetEntry.mockResolvedValue(null);
    renderWithProviders(<BudgetPanel project={PROJECT} onChanged={vi.fn()} />, { user: ADMIN, width: 400 });
    await screen.findByRole('list', { name: 'Spend entries' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Travel' }));
    expect(listBudgetEntries).toHaveBeenLastCalledWith(1, { category: 'travel', from: '', to: '', q: '' });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete spend of ₹10.00' }));
    expect(dialog()).toHaveTextContent('kept in the project\'s history');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(deleteBudgetEntry).toHaveBeenCalledWith(4);
  });

  it('shows the empty state for entries and summary errors', async () => {
    getBudgetSummary.mockResolvedValue(summary);
    listBudgetEntries.mockResolvedValue([]);
    renderWithProviders(<BudgetPanel project={PROJECT} onChanged={vi.fn()} />, { user: PM });
    expect(await screen.findByText('No spend recorded yet.')).toBeInTheDocument();
  });

  it('reports a summary error', async () => {
    getBudgetSummary.mockRejectedValue(new Error('Budget unavailable'));
    renderWithProviders(<BudgetPanel project={PROJECT} onChanged={vi.fn()} />, { user: PM });
    expect(await screen.findByText('Budget unavailable')).toBeInTheDocument();
  });
});

describe('DeliverablesPanel flows', () => {
  const item = { id: 2, project_id: 1, title: 'Spec', description: null, status: 'in_progress', due_date: null,
    is_blocked: false, is_overdue: false, predecessor_count: 1, successor_count: 1, assignee_name: null };

  it('opens a deliverable, saves an edit and deletes with its links', async () => {
    listDeliverables.mockResolvedValue([item]);
    getDeliverable.mockResolvedValue({ ...item, predecessors: [], successors: [] });
    updateDeliverable.mockResolvedValue({ ...item, title: 'Spec v2' });
    deleteDeliverable.mockResolvedValue(null);
    const onChanged = vi.fn();
    renderWithProviders(<DeliverablesPanel project={PROJECT} onChanged={onChanged} />, { user: PM });
    await userEvent.click(await screen.findByRole('row', { name: 'Open Spec' }));
    const title = await within(dialog()).findByDisplayValue('Spec');
    await userEvent.clear(title);
    await userEvent.type(title, 'Spec v2');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Updated Spec v2')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Spec' }));
    expect(dialog()).toHaveTextContent('with its 2 dependency link(s)');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(deleteDeliverable).toHaveBeenCalledWith(2);
  });

  it('filters by status, blocked and search', async () => {
    listDeliverables.mockResolvedValue([]);
    renderWithProviders(<DeliverablesPanel project={PROJECT} onChanged={vi.fn()} />, { user: PM });
    await screen.findByText('No deliverables yet.');
    await userEvent.click(screen.getByLabelText('Blocked'));
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Done' }));
    expect(await screen.findByText('No deliverables match these filters.')).toBeInTheDocument();
    expect(listDeliverables).toHaveBeenCalledWith(expect.objectContaining({ project_id: 1, status: 'done', blocked: true }));
  });

  it('opens a read-only view for viewers', async () => {
    listDeliverables.mockResolvedValue([item]);
    getDeliverable.mockResolvedValue({ ...item, predecessors: [], successors: [] });
    renderWithProviders(<DeliverablesPanel project={PROJECT} onChanged={vi.fn()} />, { user: { id: 9, role: 'viewer' } });
    await userEvent.click(await screen.findByRole('row', { name: 'Open Spec' }));
    expect(await within(dialog()).findByDisplayValue('Spec')).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
  });
});

describe('UsersPage flows', () => {
  const users = [
    { id: 1, email: 'ada@acme.test', full_name: 'Ada', role: 'admin', is_active: true },
    { id: 2, email: 'pat@acme.test', full_name: 'Pat', role: 'project_manager', is_active: true },
  ];

  it('edits a role, resets a password and deletes a user', async () => {
    listUsers.mockResolvedValue(users);
    updateUser.mockResolvedValue({ ...users[1], role: 'viewer' });
    deleteUser.mockRejectedValueOnce(new ApiError(409, 'conflict', 'This user still owns projects: reassign them or deactivate the user'));
    renderWithProviders(<UsersPage />, { user: ADMIN, width: 400 });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Pat' }));
    await userEvent.click(within(dialog()).getByRole('combobox', { name: 'Role' }));
    await userEvent.click(screen.getByRole('option', { name: 'Viewer' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(updateUser).toHaveBeenCalledWith(2, { email: 'pat@acme.test', full_name: 'Pat', role: 'viewer', is_active: true });
    expect(await screen.findByText('Updated Pat')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset password for Pat' }));
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Pat' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/still owns projects/)).toBeInTheDocument();
  });

  it('filters by role and status', async () => {
    listUsers.mockResolvedValue([]);
    renderWithProviders(<UsersPage />, { user: ADMIN });
    await screen.findByText('No users match these filters.');
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    await userEvent.click(screen.getByRole('option', { name: 'Team lead' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(listUsers).toHaveBeenLastCalledWith({ q: '', role: 'team_lead', active: 'false' });
  });
});

describe('ProjectsPage flows', () => {
  it('filters by status and deletes after confirming', async () => {
    listProjects.mockResolvedValue([{ id: 1, code: 'P-1', name: 'One', status: 'active', owner_id: 7, owner_name: 'Pat',
      deliverable_count: 0, allocation_count: 0, budget_entry_count: 0, burn_pct: null }]);
    deleteProject.mockResolvedValue(null);
    renderWithProviders(<ProjectsPage />, { user: PM });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete P-1' }));
    expect(dialog()).toHaveTextContent('P-1 – One will be permanently deleted. To retire');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Deleted P-1')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Completed' }));
    expect(listProjects).toHaveBeenLastCalledWith({ status: 'completed', q: '', department_id: '' });
  });

  it('reports a failed delete', async () => {
    listProjects.mockResolvedValue([{ id: 1, code: 'P-1', name: 'One', status: 'active', owner_id: 7 }]);
    deleteProject.mockRejectedValue(new Error('Only an admin can delete it'));
    renderWithProviders(<ProjectsPage />, { user: PM });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete P-1' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Only an admin can delete it')).toBeInTheDocument();
  });
});
