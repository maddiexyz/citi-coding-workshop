import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import AuthContext from './authContext';
import { setUnauthorizedHandler, tokenStore } from '../services/api';
import * as authApi from '../services/authApi';

/**
 * Keeps track of the signed-in user.
 *
 * On page load it restores the session: from the access token in this tab
 * (/auth/me), or else from the HttpOnly refresh cookie (/auth/refresh), so a
 * new tab or a reload after the token expired stays signed in. A 401 that a
 * refresh can't fix signs the user out.
 */
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const logout = useCallback((message = null) => {
    // Revoke the refresh token on the server too; signing out locally doesn't wait for it
    if (!message) authApi.logout().catch(() => {});
    tokenStore.clear();
    setUser(null);
    setNotice(message);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(email, password);
    tokenStore.set(result.token);
    setNotice(null);
    setUser(result.user);
    return result.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout('Your session has expired. Please sign in again.'));
  }, [logout]);

  useEffect(() => {
    const restore = tokenStore.get()
      ? authApi.fetchCurrentUser().then((result) => result.user)
      : authApi.refreshSession().then((session) => session?.user ?? null);
    restore
      .then((restored) => setUser(restored))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({ user, loading, notice, login, logout }),
    [user, loading, notice, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
