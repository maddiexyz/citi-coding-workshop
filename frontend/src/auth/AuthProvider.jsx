import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import AuthContext from './authContext';
import { setUnauthorizedHandler, tokenStore } from '../services/api';
import * as authApi from '../services/authApi';

/**
 * Keeps track of the signed-in user.
 *
 * On page load it restores the session from the stored token by calling
 * /auth/me. Any 401 from a signed-in request signs the user out.
 */
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  const [notice, setNotice] = useState(null);

  const logout = useCallback((message = null) => {
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
    if (!tokenStore.get()) return;
    authApi.fetchCurrentUser()
      .then((result) => setUser(result.user))
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
