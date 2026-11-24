import { useEffect, useState } from 'react';

/**
 * Return value, but only after it has stopped changing for delayMs
 * (e.g. so a search box doesn't fire a request per keystroke).
 * @template T
 * @param {T} value
 * @param {number} [delayMs]
 * @returns {T}
 */
export default function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
