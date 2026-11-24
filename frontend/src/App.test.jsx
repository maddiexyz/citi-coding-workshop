import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import AuthContext from './auth/authContext';

vi.mock('./pages/DashboardPage', () => ({ default: () => <h1>dashboard page</h1> }));
vi.mock('./pages/ProjectsPage', () => ({ default: () => <h1>projects page</h1> }));
vi.mock('./pages/UsersPage', () => ({ default: () => <h1>users page</h1> }));

function renderApp(path, user) {
  render(
    <AuthContext.Provider value={{ user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('App routes', () => {
  const admin = { id: 1, role: 'admin', full_name: 'Ada' };

  it('loads a page lazily inside the app frame', async () => {
    renderApp('/projects', admin);
    expect(await screen.findByRole('heading', { name: 'projects page' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('sends unknown paths to the dashboard', async () => {
    renderApp('/nowhere', admin);
    expect(await screen.findByRole('heading', { name: 'dashboard page' })).toBeInTheDocument();
  });

  it('sends signed-out visitors to the login page', async () => {
    renderApp('/users', null);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('users page')).not.toBeInTheDocument();
  });
});
