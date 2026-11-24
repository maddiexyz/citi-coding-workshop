import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthProvider from './AuthProvider';
import useAuth from './useAuth';
import { tokenStore } from '../services/api';
import * as authApi from '../services/authApi';

vi.mock('../services/authApi', () => ({
  login: vi.fn(), fetchCurrentUser: vi.fn(), refreshSession: vi.fn(), logout: vi.fn(),
}));

function Who() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p>{user ? `signed in as ${user.full_name}` : 'signed out'}</p>;
}

afterEach(() => tokenStore.clear());

describe('AuthProvider', () => {
  it('restores the session from the refresh cookie in a new tab', async () => {
    authApi.refreshSession.mockResolvedValue({ token: 't', user: { id: 1, full_name: 'Pat' } });
    render(<AuthProvider><Who /></AuthProvider>);
    expect(await screen.findByText('signed in as Pat')).toBeInTheDocument();
    expect(authApi.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('stays signed out when there is no session', async () => {
    authApi.refreshSession.mockResolvedValue(null);
    render(<AuthProvider><Who /></AuthProvider>);
    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('uses the token in this tab when there is one', async () => {
    tokenStore.set('abc');
    authApi.fetchCurrentUser.mockResolvedValue({ user: { id: 2, full_name: 'Ada' } });
    render(<AuthProvider><Who /></AuthProvider>);
    expect(await screen.findByText('signed in as Ada')).toBeInTheDocument();
  });
});
