import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A counter that goes up every intervalMs while the page is visible, so data
 * effects that depend on it re-run (polling). It pauses while the tab is
 * hidden and refreshes as soon as the tab is shown again if a tick was missed.
 * refresh() bumps it by hand (a "Refresh" button).
 * @param {number} [intervalMs] Default 30 s.
 * @returns {{tick: number, refresh: () => void}}
 */
export default function useAutoRefresh(intervalMs = 30000) {
  const [tick, setTick] = useState(0);
  const missed = useRef(false);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') missed.current = true;
      else refresh();
    }, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && missed.current) {
        missed.current = false;
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, refresh]);

  return { tick, refresh };
}
