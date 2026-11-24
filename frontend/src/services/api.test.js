import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, refreshSession, setUnauthorizedHandler, tokenStore } from './api';

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

  it('signs the user out when a 401 can\'t be fixed by refreshing', async () => {
    tokenStore.set('expired');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { error: { code: 'token_expired', message: 'Expired' } });

    await expect(apiRequest('/projects')).rejects.toThrow('Expired');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('refreshes an expired token once and retries the request', async () => {
    tokenStore.set('expired');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const respond = (status, body) => ({ ok: status < 300, status, json: () => Promise.resolve(body) });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(401, { error: { code: 'token_expired', message: 'Expired' } }))
      .mockResolvedValueOnce(respond(200, { token: 'fresh', user: { id: 1 } }))
      .mockResolvedValueOnce(respond(200, { items: ['ok'] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/projects')).resolves.toEqual({ items: ['ok'] });
    const [refreshUrl, refreshOptions] = fetchMock.mock.calls[1];
    expect(refreshUrl).toMatch(/\/api\/auth\/refresh$/);
    expect(refreshOptions.credentials).toBe('include');      // sends the HttpOnly cookie
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
    expect(tokenStore.get()).toBe('fresh');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('shares one refresh between requests that expire together', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true, status: 200, json: () => Promise.resolve({ token: 't', user: {} }) }), 10);
    }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('only sends cookies to the auth endpoints', async () => {
    const fetchMock = mockFetch(200, {});
    await apiRequest('/projects');
    await apiRequest('/auth/login', { method: 'POST', body: {} });
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin');
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include');
  });

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('/projects')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
