import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../auth/authContext';
import ProjectsPage from './ProjectsPage';
import { listProjects } from '../services/projectsApi';

vi.mock('../services/departmentsApi', () => ({ listDepartments: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/projectsApi', () => ({
  listProjects: vi.fn(),
  deleteProject: vi.fn(),
}));

const PROJECTS = [
  { id: 1, code: 'MINE-1', name: 'My project', status: 'active', owner_id: 7, owner_name: 'Me' },
  { id: 2, code: 'THEIRS-1', name: 'Their project', status: 'planned', owner_id: 8, owner_name: 'Them' },
];

function renderAs(role, width = 1200, result = Promise.resolve(PROJECTS)) {
  listProjects.mockReturnValue(result);
  const auth = { user: { id: 7, role, full_name: 'Me' }, loading: false, notice: null, login: vi.fn(), logout: vi.fn() };
  return render(
    <ResponsiveContext.Provider value={{ width }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <ProjectsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}

describe('ProjectsPage', () => {
  it('shows no write actions to a viewer', async () => {
    renderAs('viewer');

    expect(await screen.findByText('My project')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows a project manager actions only on projects they own', async () => {
    renderAs('project_manager');

    expect(await screen.findByRole('link', { name: /new project/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit MINE-1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit THEIRS-1' })).not.toBeInTheDocument();
  });

  it('hides delete from the owning PM once a project has spend, and shows burn', async () => {
    renderAs('project_manager', 1200, Promise.resolve([
      { ...PROJECTS[0], budget_entry_count: 1, burn_pct: '110.0', over_budget: true },
    ]));
    expect(await screen.findByRole('link', { name: 'Edit MINE-1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete MINE-1' })).not.toBeInTheDocument();
    expect(screen.getByText('110.0% · over budget')).toBeInTheDocument();
  });

  it('lists what a delete removes', async () => {
    renderAs('project_manager', 1200, Promise.resolve([
      { ...PROJECTS[0], deliverable_count: 2, allocation_count: 1, budget_entry_count: 0 },
    ]));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete MINE-1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('together with 2 deliverables, 1 allocation');
    expect(screen.getByRole('dialog')).toHaveTextContent('set its status to completed or cancelled');
  });

  it('uses a table on desktop and cards on mobile', async () => {
    const { unmount } = renderAs('viewer', 1200);
    expect(await screen.findByRole('table', { name: 'Projects' })).toBeInTheDocument();
    unmount();

    renderAs('viewer', 400);
    expect(await screen.findByRole('list', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error message when loading fails', async () => {
    renderAs('viewer', 1200, Promise.reject(new Error('Cannot reach the server.')));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });
});
