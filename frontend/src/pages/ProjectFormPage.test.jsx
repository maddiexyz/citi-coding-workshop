import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectFormPage from './ProjectFormPage';
import renderWithProviders from '../test/renderWithProviders';
import { ApiError } from '../services/api';
import { createProject, getProject, updateProject } from '../services/projectsApi';
import { listUsers } from '../services/usersApi';

vi.mock('../services/projectsApi', () => ({ createProject: vi.fn(), getProject: vi.fn(), updateProject: vi.fn() }));
vi.mock('../services/usersApi', () => ({ listUsers: vi.fn() }));
vi.mock('../services/departmentsApi', () => ({ listDepartments: vi.fn().mockResolvedValue([{ id: 4, name: 'Finance' }]) }));

const PM = { id: 7, role: 'project_manager', full_name: 'Pat' };
const PROJECT = {
  id: 3, code: 'WEB-1', name: 'Website', description: null, status: 'active', start_date: '2030-01-01',
  end_date: '2030-06-30', owner_id: 7, team_lead_id: 5, team_lead_name: 'Lee', budget_planned: '1000.00',
};

beforeEach(() => {
  listUsers.mockResolvedValue([{ id: 5, full_name: 'Lee' }, { id: 6, full_name: 'Sam' }]);
});

describe('ProjectFormPage – create', () => {
  it('checks fields before calling the backend', async () => {
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/new', route: '/projects/new' });
    await userEvent.type(screen.getByRole('textbox', { name: /^Code/ }), 'x');
    await userEvent.type(screen.getByLabelText(/Planned budget/), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Save project' }));
    expect(screen.getByText('Use 2-20 letters, digits or dashes, e.g. ACME-01')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount of 0 or more, with at most 2 decimals')).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('sends a clean payload, with the team lead and budget, then returns to the list', async () => {
    createProject.mockResolvedValue({ ...PROJECT, code: 'NEW-1' });
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/new', route: '/projects/new' });
    await userEvent.type(screen.getByRole('textbox', { name: /^Code/ }), 'new-1');
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), '  New project ');
    await userEvent.type(screen.getByLabelText(/Planned budget/), '2500.50');
    await userEvent.click(screen.getByRole('combobox', { name: /Team lead/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Sam' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Finance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save project' }));

    expect(createProject).toHaveBeenCalledWith({
      code: 'NEW-1', name: 'New project', description: null, status: 'planned', start_date: null, end_date: null,
      team_lead_id: 6, department_id: 4, budget_planned: '2500.50',
    });
    expect(await screen.findByText('projects list')).toBeInTheDocument();
  });

  it('shows backend errors next to the field', async () => {
    createProject.mockRejectedValue(new ApiError(409, 'conflict', 'A project with this code already exists',
      { code: 'This code is already in use' }));
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/new', route: '/projects/new' });
    await userEvent.type(screen.getByRole('textbox', { name: /^Code/ }), 'WEB-1');
    await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Dup');
    await userEvent.click(screen.getByRole('button', { name: 'Save project' }));
    expect(await screen.findByText('This code is already in use')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('A project with this code already exists');
  });

  it('tells viewers they cannot create projects', () => {
    renderWithProviders(<ProjectFormPage />, { user: { id: 9, role: 'viewer' }, path: '/projects/new', route: '/projects/new' });
    expect(screen.getByText(/permission to create projects/)).toBeInTheDocument();
  });
});

describe('ProjectFormPage – edit', () => {
  it('loads the project and saves changes', async () => {
    getProject.mockResolvedValue(PROJECT);
    updateProject.mockResolvedValue(PROJECT);
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/3/edit', route: '/projects/:id/edit' });
    expect(await screen.findByRole('heading', { name: 'Edit WEB-1' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Planned budget/)).toHaveValue('1000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Save project' }));
    expect(updateProject).toHaveBeenCalledWith('3', expect.objectContaining({ team_lead_id: 5, budget_planned: '1000.00' }));
  });

  it('refuses another PM\'s project and reports a missing one', async () => {
    getProject.mockResolvedValue({ ...PROJECT, owner_id: 99 });
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/3/edit', route: '/projects/:id/edit' });
    expect(await screen.findByText(/permission to edit this project/)).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    getProject.mockRejectedValue(new Error('Project not found'));
    renderWithProviders(<ProjectFormPage />, { user: PM, path: '/projects/9/edit', route: '/projects/:id/edit' });
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
  });
});
