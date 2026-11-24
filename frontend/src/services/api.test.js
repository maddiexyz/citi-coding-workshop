import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setUnauthorizedHandler, tokenStore } from './api';

function mockFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(() => {});
});

describe('apiRequest', () => {
  it('sends the stored token and skips empty query parameters', async () => {
    tokenStore.set('abc');
    const fetchMock = mockFetch(200, { items: [] });

    await apiRequest('/projects', { query: { status: 'active', q: '' } });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/projects\?status=active$/);
    expect(options.headers.Authorization).toBe('Bearer abc');
  });

  it('turns the backend error format into an ApiError', async () => {
    mockFetch(400, { error: { code: 'validation_error', message: 'Some fields are invalid', details: { name: 'Required' } } });

    const error = await apiRequest('/projects', { method: 'POST', body: {} }).catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'validation_error', details: { name: 'Required' } });
  });

  it('signs the user out when a signed-in request gets 401', async () => {
    tokenStore.set('expired');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { error: { code: 'token_expired', message: 'Expired' } });

    await expect(apiRequest('/projects')).rejects.toThrow('Expired');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('/projects')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
