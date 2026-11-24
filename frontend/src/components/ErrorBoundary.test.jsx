import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';
import { claimChunkReload, isChunkLoadError } from '../utils/chunkError';

function Boom({ error }) {
  throw error;
}

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: http://x/assets/Page-abc.js');

describe('ErrorBoundary', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders its children when nothing fails', () => {
    render(<ErrorBoundary><p>Page content</p></ErrorBoundary>);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('shows a message with a reload button instead of a blank page', async () => {
    const onReload = vi.fn();
    render(<ErrorBoundary onReload={onReload}><Boom error={new Error('kaput')} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('link', { name: 'Go to home page' })).toHaveAttribute('href', '/');
    expect(onReload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('reloads once by itself when a page chunk fails to load, then just explains', () => {
    const onReload = vi.fn();
    const { unmount } = render(<ErrorBoundary onReload={onReload}><Boom error={chunkError()} /></ErrorBoundary>);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('A new version of ACME Projects is available');
    unmount();

    // Fails again straight after the reload: no second automatic reload (no loop)
    render(<ErrorBoundary onReload={onReload}><Boom error={chunkError()} /></ErrorBoundary>);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Reload to continue');
  });

  it('recovers when the reset key changes (e.g. after navigating)', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom error={new Error('kaput')} /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><p>Other page</p></ErrorBoundary>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Other page')).toBeInTheDocument();
  });
});

describe('chunk load errors', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/a.js',
    'error loading dynamically imported module: https://x/assets/a.js',
    'Importing a module script failed.',
    'Loading chunk 42 failed.',
  ])('recognises "%s"', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('allows one automatic reload per 30 seconds', () => {
    const storage = window.sessionStorage;
    storage.clear();
    expect(claimChunkReload(1_000, storage)).toBe(true);
    expect(claimChunkReload(20_000, storage)).toBe(false);
    expect(claimChunkReload(31_001, storage)).toBe(true);
  });

  it('never reloads when storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(claimChunkReload(1_000, broken)).toBe(false);
  });
});
