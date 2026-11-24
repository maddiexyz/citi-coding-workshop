import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useAutoRefresh from './useAutoRefresh';

let visibility = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoRefresh', () => {
  it('ticks every interval while the tab is visible', () => {
    const { result } = renderHook(() => useAutoRefresh(30000));
    act(() => vi.advanceTimersByTime(30000));
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.tick).toBe(2);
  });

  it('pauses while hidden and catches up when the tab is shown again', () => {
    const { result } = renderHook(() => useAutoRefresh(30000));
    visibility = 'hidden';
    act(() => vi.advanceTimersByTime(90000));
    expect(result.current.tick).toBe(0);
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.tick).toBe(1);
  });

  it('refreshes on demand', () => {
    const { result } = renderHook(() => useAutoRefresh());
    act(() => result.current.refresh());
    expect(result.current.tick).toBe(1);
  });
});
