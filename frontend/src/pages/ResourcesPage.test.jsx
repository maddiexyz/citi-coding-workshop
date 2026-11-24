import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResourcesPage from './ResourcesPage';
import ResourceDetailPage from './ResourceDetailPage';
import renderWithProviders from '../test/renderWithProviders';
import { ApiError } from '../services/api';
import {
  createResource, deleteResource, getResource, getResourceLoad, listResources, updateResource,
} from '../services/resourcesApi';
import { listUsers } from '../services/usersApi';
import { createDepartment, deleteDepartment, listDepartments } from '../services/departmentsApi';
import groupByDepartment from '../utils/groupByDepartment';

vi.mock('../services/resourcesApi', () => ({
  listResources: vi.fn(), getResource: vi.fn(), getResourceLoad: vi.fn(),
  createResource: vi.fn(), updateResource: vi.fn(), deleteResource: vi.fn(),
}));
vi.mock('../services/usersApi', () => ({ listUsers: vi.fn() }));
vi.mock('../services/departmentsApi', () => ({
  listDepartments: vi.fn(), createDepartment: vi.fn(), renameDepartment: vi.fn(), deleteDepartment: vi.fn(),
}));

const ADMIN = { id: 1, role: 'admin' };
const PAT = { id: 3, full_name: 'Pat Lee', email: 'pat@acme.test', title: 'Analyst', department_id: 1, department_name: 'Data',
  weekly_hours: '40.00', week_hours: '50.00', over_allocated: true, is_active: true, user_id: null };
const SAM = { ...PAT, id: 4, full_name: 'Sam Roe', week_hours: '10.00', over_allocated: false, is_active: false };

beforeEach(() => {
  listResources.mockResolvedValue({ items: [PAT, SAM], week_start: '2030-01-07' });
  listUsers.mockResolvedValue([{ id: 8, full_name: 'Pat Login', email: 'pat@acme.test' }]);
  listDepartments.mockResolvedValue([{ id: 1, name: 'Data', resource_count: 2, project_count: 0 },
    { id: 2, name: 'Finance', resource_count: 0, project_count: 0 }]);
});

describe('ResourcesPage', () => {
  it('shows load against capacity and flags over-allocation, without admin actions for a PM', async () => {
    renderWithProviders(<ResourcesPage />, { user: { id: 7, role: 'project_manager' } });
    const table = await screen.findByRole('table', { name: 'People' });
    expect(within(table).getByText('50 h / 40 h')).toBeInTheDocument();
    expect(within(table).getByText('Over-allocated')).toBeInTheDocument();
    expect(within(table).getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText(/week of 7 Jan 2030/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New person' })).not.toBeInTheDocument();
  });

  it('filters on over-allocation and status', async () => {
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await screen.findByRole('table', { name: 'People' });
    await userEvent.click(screen.getByLabelText('Over-allocated this week'));
    expect(listResources).toHaveBeenLastCalledWith({ q: '', active: 'true', over_allocated: true, department_id: '' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Everyone' }));
    expect(listResources).toHaveBeenLastCalledWith({ q: '', active: '', over_allocated: true, department_id: '' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }));
    await userEvent.click(screen.getByRole('option', { name: 'Finance' }));
    expect(listResources).toHaveBeenLastCalledWith({ q: '', active: '', over_allocated: true, department_id: 2 });
  });

  it('shows cards on mobile and the empty state', async () => {
    listResources.mockResolvedValue({ items: [PAT], week_start: '2030-01-07' });
    renderWithProviders(<ResourcesPage />, { user: ADMIN, width: 400 });
    expect(await screen.findByRole('list', { name: 'People' })).toBeInTheDocument();
  });

  it('lets an admin add a person, checking the 60-hour cap first', async () => {
    createResource.mockResolvedValue({ ...PAT, id: 9, full_name: 'New One' });
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await userEvent.click(await screen.findByRole('button', { name: 'New person' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'New One');
    const hours = within(dialog).getByLabelText(/Weekly hours/);
    await userEvent.clear(hours);
    await userEvent.type(hours, '61');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Must be more than 0 and at most 60')).toBeInTheDocument();
    await userEvent.clear(hours);
    await userEvent.type(hours, '32.5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(createResource).toHaveBeenCalledWith({
      full_name: 'New One', email: null, department_id: null, title: null, weekly_hours: '32.5', user_id: null, is_active: true,
    });
    expect(await screen.findByText('Created New One')).toBeInTheDocument();
  });

  it('edits a person and shows backend field errors', async () => {
    updateResource.mockRejectedValue(new ApiError(409, 'conflict', 'A resource with these details already exists',
      { email: 'Email already in use' }));
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Pat Lee' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
    expect(updateResource).toHaveBeenCalledWith(3, expect.objectContaining({ weekly_hours: '40.00', email: 'pat@acme.test' }));
  });

  it('explains why a person with allocations can\'t be deleted', async () => {
    deleteResource.mockRejectedValue(new ApiError(409, 'conflict', 'This resource still has allocations: remove them or deactivate it'));
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Pat Lee' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/still has allocations/)).toBeInTheDocument();
  });

  it('groups people by department with headcount, load and over-allocation', async () => {
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await screen.findByRole('table', { name: 'People' });
    await userEvent.click(screen.getByLabelText('Group by department'));
    const data = screen.getByRole('region', { name: 'Data' });
    expect(within(data).getByText('2 people · 60 h allocated of 80 h capacity this week · 1 over-allocated')).toBeInTheDocument();
    expect(within(data).getByRole('table', { name: 'People in Data' })).toBeInTheDocument();
  });

  it('lets an admin add and delete departments, explaining a delete that is refused', async () => {
    createDepartment.mockResolvedValue({ id: 3, name: 'Ops' });
    deleteDepartment.mockRejectedValue(new ApiError(409, 'conflict', 'Data is still used by 2 people and 0 projects: move them first'));
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    await userEvent.click(await screen.findByRole('button', { name: 'Departments' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('2 people · 0 projects')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('New department'), 'Ops');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(createDepartment).toHaveBeenCalledWith('Ops');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Data' }));
    expect(await within(dialog).findByText(/still used by 2 people/)).toBeInTheDocument();
  });

  it('hides department management from non-admins', async () => {
    renderWithProviders(<ResourcesPage />, { user: { id: 7, role: 'project_manager' } });
    await screen.findByRole('table', { name: 'People' });
    expect(screen.queryByRole('button', { name: 'Departments' })).not.toBeInTheDocument();
  });

  it('shows a load error', async () => {
    listResources.mockRejectedValue(new Error('Cannot reach the server.'));
    renderWithProviders(<ResourcesPage />, { user: ADMIN });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});

describe('ResourceDetailPage', () => {
  it('shows capacity, the weekly load and allocations', async () => {
    getResource.mockResolvedValue({ ...PAT, user_name: 'Pat Login', allocations: [
      { id: 1, project_id: 2, project_code: 'WEB-1', project_name: 'Website', hours_per_week: '30.00',
        start_date: '2030-01-07', end_date: '2030-02-01', note: 'Frontend' }] });
    getResourceLoad.mockResolvedValue({ weeks: [
      { week_start: '2030-01-07', total_hours: '50.00', weekly_hours: '40.00', over_by: '10.00',
        projects: [{ project_id: 2, project_code: 'WEB-1', hours: '30.00' }] },
      { week_start: '2030-01-14', total_hours: '0', weekly_hours: '40.00', over_by: '0', projects: [] }] });
    renderWithProviders(<ResourceDetailPage />, { user: ADMIN, path: '/resources/3', route: '/resources/:id' });
    expect(await screen.findByRole('heading', { name: 'Pat Lee' })).toBeInTheDocument();
    expect(screen.getByText(/Signs in as Pat Login/)).toBeInTheDocument();
    const load = screen.getByRole('table', { name: 'Weekly load' });
    expect(within(load).getByText('Over by 10 h')).toBeInTheDocument();
    expect(within(load).getByText('WEB-1 · 30 h')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WEB-1 – Website' })).toHaveAttribute('href', '/projects/2?tab=allocations');
  });

  it('reports a missing person', async () => {
    getResource.mockRejectedValue(new Error('Resource not found'));
    getResourceLoad.mockResolvedValue({ weeks: [] });
    renderWithProviders(<ResourceDetailPage />, { user: ADMIN, path: '/resources/9', route: '/resources/:id' });
    expect(await screen.findByText('Resource not found')).toBeInTheDocument();
  });
});

describe('groupByDepartment', () => {
  it('puts people without a department last', () => {
    const groups = groupByDepartment([
      { id: 1, department_name: null, weekly_hours: '10', week_hours: '0', over_allocated: false },
      { id: 2, department_name: 'Ops', weekly_hours: '40', week_hours: '45', over_allocated: true },
    ]);
    expect(groups.map((g) => [g.name, g.capacity, g.allocated, g.over])).toEqual([['Ops', 40, 45, 1], ['No department', 10, 0, 0]]);
  });
});
