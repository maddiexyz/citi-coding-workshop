import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountPage from './AccountPage';
import renderWithProviders from '../test/renderWithProviders';
import { ApiError } from '../services/api';
import { changePassword } from '../services/authApi';

vi.mock('../services/authApi', () => ({ changePassword: vi.fn() }));

const USER = { id: 4, full_name: 'Pat Lee', email: 'pat@acme.test', role: 'project_manager' };

async function fill(current, next, confirm = next) {
  await userEvent.type(screen.getByLabelText(/Current password/), current);
  await userEvent.type(screen.getByLabelText(/^New password/), next);
  await userEvent.type(screen.getByLabelText(/Repeat new password/), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('AccountPage', () => {
  it('shows who is signed in', () => {
    renderWithProviders(<AccountPage />, { user: USER });
    expect(screen.getByText('pat@acme.test · Project manager')).toBeInTheDocument();
  });

  it('checks the new password before calling the backend', async () => {
    renderWithProviders(<AccountPage />, { user: USER });
    await fill('old-password', 'short', 'shorter');
    expect(screen.getByText('Must be at least 10 characters')).toBeInTheDocument();
    expect(screen.getByText('The two new passwords don’t match')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and says other devices were signed out', async () => {
    changePassword.mockResolvedValue(null);
    renderWithProviders(<AccountPage />, { user: USER });
    await fill('old-password', 'brand-new-pass');
    expect(changePassword).toHaveBeenCalledWith('old-password', 'brand-new-pass');
    expect(await screen.findByText(/other devices were signed out/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Current password/)).toHaveValue('');
  });

  it('shows a wrong current password next to the field', async () => {
    changePassword.mockRejectedValue(new ApiError(400, 'validation_error', 'Some fields are invalid',
      { current_password: 'Incorrect password' }));
    renderWithProviders(<AccountPage />, { user: USER });
    await fill('wrong-one', 'brand-new-pass');
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
  });
});
