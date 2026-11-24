import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AuthContext from '../auth/authContext';
import RequireAuth from '../auth/RequireAuth';
import AppLayout from './AppLayout';
import BudgetEntryDialog from './budget/BudgetEntryDialog';
import PasswordDialog from './users/PasswordDialog';
import { createBudgetEntry, updateBudgetEntry } from '../services/budgetApi';
import { resetPassword } from '../services/usersApi';
import { ApiError } from '../services/api';

vi.mock('../services/budgetApi', () => ({ createBudgetEntry: vi.fn(), updateBudgetEntry: vi.fn() }));
vi.mock('../services/usersApi', () => ({ resetPassword: vi.fn() }));

function withAuth(ui, auth, path = '/') {
  return render(
    <AuthContext.Provider value={{ notice: null, login: vi.fn(), logout: vi.fn(), ...auth }}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('BudgetEntryDialog', () => {
  it('records spend as an exact string amount', async () => {
    createBudgetEntry.mockResolvedValue({ id: 1, amount: '99.95', category: 'travel' });
    const onSaved = vi.fn();
    render(<BudgetEntryDialog projectId={4} currency="EUR" onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText(/Amount \(EUR\)/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Amount/), '99.95');
    await userEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    await userEvent.click(screen.getByRole('option', { name: 'Travel' }));
    await userEvent.type(screen.getByLabelText('Description'), ' Train ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(createBudgetEntry).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 4, amount: '99.95', category: 'travel', description: 'Train',
    }));
    expect(onSaved).toHaveBeenCalledWith({ id: 1, amount: '99.95', category: 'travel' }, 'Recorded');
  });

  it('edits an entry and shows backend errors', async () => {
    updateBudgetEntry.mockRejectedValue(new ApiError(400, 'validation_error', 'Some fields are invalid', { spent_on: 'Bad date' }));
    render(<BudgetEntryDialog projectId={4} currency="USD" onClose={vi.fn()} onSaved={vi.fn()}
      entry={{ id: 2, category: 'labor', amount: '10.00', spent_on: '2030-01-01', description: null }} />);
    expect(screen.getByRole('heading', { name: 'Edit spend' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateBudgetEntry).toHaveBeenCalledWith(2, expect.objectContaining({ amount: '10.00' }));
    expect(await screen.findByText('Bad date')).toBeInTheDocument();
  });
});

describe('PasswordDialog', () => {
  it('needs 10 characters, then resets', async () => {
    resetPassword.mockResolvedValue(null);
    const onSaved = vi.fn();
    render(<PasswordDialog user={{ id: 5, full_name: 'Pat' }} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByText(/signed out on every device/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/New password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at least 10 characters');
    await userEvent.type(screen.getByLabelText(/New password/), '-and-longer');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(resetPassword).toHaveBeenCalledWith(5, 'short-and-longer');
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows a backend error', async () => {
    resetPassword.mockRejectedValue(new ApiError(400, 'validation_error', 'x', { password: 'Too weak' }));
    render(<PasswordDialog user={{ id: 5, full_name: 'Pat' }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/New password/), 'long-enough-1');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('Too weak')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  it('waits while the session is being restored', () => {
    withAuth(<RequireAuth><p>secret</p></RequireAuth>, { user: null, loading: true });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('shows the page to a signed-in user', () => {
    withAuth(<RequireAuth><p>secret</p></RequireAuth>, { user: { id: 1, role: 'viewer' }, loading: false });
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});

describe('AppLayout', () => {
  const user = (role) => ({ id: 1, role, full_name: 'Pat Lee' });

  it('shows Users only to admins and marks the current section', () => {
    withAuth(<AppLayout><p>content</p></AppLayout>, { user: user('admin'), loading: false }, '/projects/3');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('DashboardProjectsPeopleUsers');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('hides Users from other roles and signs out from the user menu', async () => {
    const logout = vi.fn();
    withAuth(<AppLayout><p>content</p></AppLayout>, { user: user('viewer'), loading: false, logout });
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Pat Lee' }));
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalled();
  });
});
