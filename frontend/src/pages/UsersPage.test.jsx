import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../auth/authContext';
import UsersPage from './UsersPage';
import { createUser, listUsers } from '../services/usersApi';
import validateUser from '../utils/userValidation';

vi.mock('../services/usersApi', () => ({
  listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), deleteUser: vi.fn(),
}));

const USERS = [
  { id: 1, email: 'admin@acme.test', full_name: 'Ada Admin', role: 'admin', is_active: true },
  { id: 2, email: 'pat@acme.test', full_name: 'Pat PM', role: 'project_manager', is_active: false },
];

function renderAs(user) {
  listUsers.mockResolvedValue(USERS);
  render(
    <ResponsiveContext.Provider value={{ width: 1200 }}>
      <AuthContext.Provider value={{ user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() }}>
        <UsersPage />
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}

describe('UsersPage', () => {
  it('is for admins only', () => {
    renderAs({ id: 2, role: 'project_manager' });
    expect(screen.getByText('Only admins can manage users.')).toBeInTheDocument();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('lists users and never offers to delete yourself', async () => {
    renderAs({ id: 1, role: 'admin' });
    expect(await screen.findByText('Ada Admin (you)')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Ada Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Pat PM' })).toBeInTheDocument();
  });

  it('locks role and active for your own account', async () => {
    renderAs({ id: 1, role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Ada Admin' }));
    expect(screen.getByText('You can’t change your own role')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /you can’t deactivate yourself/i })).toBeDisabled();
  });

  it('creates a user with an initial password', async () => {
    createUser.mockResolvedValue({ id: 3, full_name: 'New Person' });
    renderAs({ id: 1, role: 'admin' });
    await userEvent.click(await screen.findByRole('button', { name: 'New user' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'New Person');
    await userEvent.type(screen.getByLabelText(/^Email/), 'new@acme.test');
    await userEvent.type(screen.getByLabelText(/Initial password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Must be at least 10 characters')).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Initial password/), '-long-enough');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(createUser).toHaveBeenCalledWith({
      email: 'new@acme.test', full_name: 'New Person', role: 'viewer', is_active: true, password: 'short-long-enough',
    });
  });
});

describe('validateUser', () => {
  it('needs a password only when creating', () => {
    const values = { email: 'a@b.co', full_name: 'A', password: '' };
    expect(validateUser(values, { creating: true })).toHaveProperty('password');
    expect(validateUser(values, { creating: false })).toEqual({});
  });
});
