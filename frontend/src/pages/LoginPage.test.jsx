import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AuthContext from '../auth/authContext';
import LoginPage from './LoginPage';

function renderLogin(login) {
  const auth = { user: null, loading: false, notice: null, login, logout: vi.fn() };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter><LoginPage /></MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('LoginPage', () => {
  it('asks for both fields before calling the backend', async () => {
    const login = vi.fn();
    renderLogin(login);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the backend error for wrong credentials', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Invalid email or password'));
    renderLogin(login);

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@acme.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(login).toHaveBeenCalledWith('admin@acme.test', 'wrong');
  });
});
