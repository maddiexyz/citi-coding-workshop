import { Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import RequireAuth from './auth/RequireAuth';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import homePath from './auth/homePath';
import useAuth from './auth/useAuth';
import LoginPage from './pages/LoginPage';

// Each page is its own chunk, loaded when first visited, so the first
// download stays small (the login page is in the main bundle).
const AccountPage = lazy(() => import('./pages/AccountPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MyWorkPage = lazy(() => import('./pages/MyWorkPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ProjectFormPage = lazy(() => import('./pages/ProjectFormPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ResourceDetailPage = lazy(() => import('./pages/ResourceDetailPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));

const pageLoading = (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
    <CircularProgress aria-label="Loading page" />
  </Box>
);

/**
 * A page inside the app frame: an error while loading or rendering it shows a
 * message in place of the page (the navigation keeps working), and going to
 * another path clears it.
 */
function Page({ children }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={pageLoading}>{children}</Suspense>
    </ErrorBoundary>
  );
}

Page.propTypes = { children: PropTypes.node.isRequired };

/**
 * Wrap a page so it needs a signed-in user and gets the app frame.
 * @param {import('react').ReactNode} page
 */
function protectedPage(page) {
  return (
    <RequireAuth>
      <AppLayout><Page>{page}</Page></AppLayout>
    </RequireAuth>
  );
}

/** Unknown paths go to the signed-in user's home page. */
function Home() {
  const { user } = useAuth();
  return <Navigate to={homePath(user)} replace />;
}

/** Application routes. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/my-work" element={protectedPage(<MyWorkPage />)} />
      <Route path="/dashboard" element={protectedPage(<DashboardPage />)} />
      <Route path="/projects" element={protectedPage(<ProjectsPage />)} />
      <Route path="/projects/new" element={protectedPage(<ProjectFormPage />)} />
      <Route path="/projects/:id" element={protectedPage(<ProjectDetailPage />)} />
      <Route path="/projects/:id/edit" element={protectedPage(<ProjectFormPage />)} />
      <Route path="/resources" element={protectedPage(<ResourcesPage />)} />
      <Route path="/resources/:id" element={protectedPage(<ResourceDetailPage />)} />
      <Route path="/users" element={protectedPage(<UsersPage />)} />
      <Route path="/account" element={protectedPage(<AccountPage />)} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
