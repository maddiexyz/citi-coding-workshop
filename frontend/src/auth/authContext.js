import { createContext } from 'react';

/**
 * Holds the signed-in user and the login/logout actions.
 * Provided by AuthProvider, read with useAuth().
 */
const AuthContext = createContext(null);

export default AuthContext;
