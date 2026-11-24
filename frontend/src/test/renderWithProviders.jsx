import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Context as ResponsiveContext } from 'react-responsive';
import AuthContext from '../auth/authContext';

/**
 * Render a page as a given user, at a URL, with a screen width.
 * @param {import('react').ReactNode} ui The element to render.
 * @param {{user?: Object, path?: string, route?: string, width?: number}} [options]
 *   `route` is the Route pattern (e.g. "/projects/:id"), `path` the URL to open.
 */
export default function renderWithProviders(ui, { user = null, path = '/', route = '*', width = 1200 } = {}) {
  const auth = { user, loading: false, notice: null, login: vi.fn(), logout: vi.fn() };
  return render(
    <ResponsiveContext.Provider value={{ width }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={ui} />
            <Route path="/projects" element={<p>projects list</p>} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ResponsiveContext.Provider>,
  );
}
