/**
 * Failed route-chunk loads. After a redeploy the old chunks are deleted
 * (deploy-frontend.sh syncs with --delete), so a tab left open fails its next
 * lazy import. Reloading picks up the new build; a guard in sessionStorage
 * stops a reload loop when the chunk is really missing.
 */

const RELOAD_KEY = 'acme-chunk-reload-at';
const RELOAD_GUARD_MS = 30_000;

// Chrome / Edge, Firefox, Safari, and webpack-style names
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i;

/** True when the error comes from a lazy import that couldn't be loaded. */
export function isChunkLoadError(error) {
  return Boolean(error) && (error.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(error.message ?? '')));
}

/**
 * Whether to reload for a chunk error now; records the attempt when it says yes.
 * @param {number} [now]
 * @param {Storage} [storage]
 */
export function claimChunkReload(now = Date.now(), storage = window.sessionStorage) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (last && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false; // storage unavailable: don't risk a loop
  }
}
