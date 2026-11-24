import { useContext } from 'react';
import AuthContext from './authContext';

/**
 * Access the auth state.
 * @returns {{
 *   user: Object|null,
 *   loading: boolean,
 *   notice: string|null,
 *   login: (email: string, password: string) => Promise<Object>,
 *   logout: (notice?: string) => void,
 * }}
 */
export default function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
