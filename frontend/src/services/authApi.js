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
