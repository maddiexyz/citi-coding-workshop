import { apiRequest } from './api';

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token: string, expires_in: number, user: Object}>}
 */
export function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password } });
}

/**
 * Fetch the user that the stored token belongs to.
 * @returns {Promise<{user: Object}>}
 */
export function fetchCurrentUser() {
  return apiRequest('/auth/me');
}

/**
 * Restore or extend the session with the HttpOnly refresh cookie.
 * @returns {Promise<{token: string, user: Object}|null>} null when there is no valid session.
 */
export { refreshSession } from './api';

/**
 * Sign out on the server: revokes the refresh token and clears its cookie.
 * @returns {Promise<null>}
 */
export function logout() {
  return apiRequest('/auth/logout', { method: 'POST' });
}

/**
 * Change the signed-in user's own password. Their other sessions are signed out.
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<null>}
 */
export function changePassword(currentPassword, newPassword) {
  return apiRequest('/auth/password', {
    method: 'POST', body: { current_password: currentPassword, new_password: newPassword },
  });
}
