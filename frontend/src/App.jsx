import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectFormPage from './pages/ProjectFormPage';
import ProjectsPage from './pages/ProjectsPage';

/**
 * Wrap a page so it needs a signed-in user and gets the app frame.
 * @param {import('react').ReactNode} page
 */
function protectedPage(page) {
  return (
    <RequireAuth>
      <AppLayout>{page}</AppLayout>
    </RequireAuth>
  );
}

/** Application routes. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/projects" element={protectedPage(<ProjectsPage />)} />
      <Route path="/projects/new" element={protectedPage(<ProjectFormPage />)} />
      <Route path="/projects/:id" element={protectedPage(<ProjectDetailPage />)} />
      <Route path="/projects/:id/edit" element={protectedPage(<ProjectFormPage />)} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
