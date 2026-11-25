import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateBriefing } from './briefingApi';
import { apiRequest } from './api';

vi.mock('./api', () => ({ apiRequest: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('generateBriefing', () => {
  it('fetches the signed facts, then hands them to the ai service', async () => {
    const signed = { bundle: { project_id: 7, facts: [] }, token: 't' };
    apiRequest.mockResolvedValueOnce(signed).mockResolvedValueOnce({ headline: 'H' });
    await expect(generateBriefing(7)).resolves.toEqual({ headline: 'H' });
    expect(apiRequest.mock.calls).toEqual([
      ['/projects/7/briefing-facts', { method: 'POST' }],
      ['/ai/briefing', { method: 'POST', body: signed }],
    ]);
  });

  it('stops when the facts are refused', async () => {
    apiRequest.mockRejectedValueOnce(new Error('403'));
    await expect(generateBriefing(7)).rejects.toThrow('403');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
