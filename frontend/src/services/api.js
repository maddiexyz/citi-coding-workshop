/**
 * Small fetch wrapper for the backend services.
 *
 * Every service is served at `${VITE_API_URL}/api/<service>`: locally through
 * the CORS proxy on port 3001, in the cloud through CloudFront. The wrapper
 * attaches the stored token and turns the backend's error format
 * `{ error: { code, message, details } }` into an ApiError.
 */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const TOKEN_KEY = 'acme.token';

/** An error returned by the backend (or a network failure, with status 0). */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status code (0 when the server was unreachable).
   * @param {string} code Machine-readable error code from the backend.
   * @param {string} message Human-readable message.
   * @param {Object<string, string>} [details] Per-field validation messages.
   */
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Token storage. sessionStorage keeps the token for this browser tab only,
 * so closing the tab signs the user out.
 */
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

let handleUnauthorized = () => {};

/**
 * Register what happens when a signed-in request gets a 401 (e.g. expired token).
 * @param {Function} handler Called with the ApiError.
 */
export function setUnauthorizedHandler(handler) {
  handleUnauthorized = handler;
}

/**
 * Build a URL with only the query parameters that have a value.
 * @param {string} path Path after /api, e.g. "/projects".
 * @param {Object<string, string>} [query] Query parameters.
 * @returns {string} The full URL.
 */
function buildUrl(path, query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  const search = params.toString();
  return `${API_URL}/api${path}${search ? `?${search}` : ''}`;
}

/**
 * Call a backend endpoint and return the decoded JSON body.
 * @param {string} path Path after /api, e.g. "/projects/12".
 * @param {Object} [options]
 * @param {string} [options.method] HTTP method (default GET).
 * @param {Object} [options.body] JSON body.
 * @param {Object<string, string>} [options.query] Query parameters.
 * @returns {Promise<any>} The response body, or null for 204 No Content.
 * @throws {ApiError} On any non-2xx response or network failure.
 */
export async function apiRequest(path, { method = 'GET', body, query } = {}) {
  const token = tokenStore.get();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (response.ok) return data;

  const error = data?.error ?? {};
  const apiError = new ApiError(
    response.status,
    error.code ?? 'http_error',
    error.message ?? `Request failed with status ${response.status}`,
    error.details ?? {},
  );
  if (response.status === 401 && token) handleUnauthorized(apiError);
  throw apiError;
}
