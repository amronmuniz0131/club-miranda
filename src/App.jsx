import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AdminDashboard from './pages/AdminDashboard';
import SessionAdmin from './pages/SessionAdmin';
import PlayerDashboard from './pages/PlayerDashboard';
import ResultsPage from './pages/ResultsPage';

function HomeRedirect() {
  const { isAdmin } = useAuth();
  return <Navigate to={isAdmin ? '/admin' : '/play'} replace />;
}

export default function App() {
  const { session, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/admin"
          element={isAdmin ? <AdminDashboard /> : <Navigate to="/play" replace />}
        />
        <Route
          path="/admin/sessions/:sessionId"
          element={isAdmin ? <SessionAdmin /> : <Navigate to="/play" replace />}
        />
        <Route path="/play" element={<PlayerDashboard />} />
        <Route path="/results/:sessionId" element={<ResultsPage />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
