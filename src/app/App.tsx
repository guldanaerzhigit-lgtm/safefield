import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { SessionsPage } from '../pages/SessionsPage';
import { SetupPage } from '../pages/SetupPage';
import { AlertsPage } from '../pages/AlertsPage';
import { AdminPage } from '../pages/AdminPage';
import { TeamPage } from '../pages/TeamPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { DispatchPage } from '../pages/DispatchPage';
import { useAuthStore } from '../stores/authStore';

export default function App() {
  const token = useAuthStore((s) => s.token);
  return <Routes>
    <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route path="/setup" element={token ? <Navigate to="/" replace /> : <SetupPage />} />
    <Route path="/" element={token ? <DashboardPage /> : <Navigate to="/login" replace />} />
    <Route path="/sessions" element={token ? <SessionsPage /> : <Navigate to="/login" replace />} />
    <Route path="/alerts" element={token ? <AlertsPage /> : <Navigate to="/login" replace />} />
    <Route path="/admin" element={token ? <AdminPage /> : <Navigate to="/login" replace />} />
    <Route path="/team" element={token ? <TeamPage /> : <Navigate to="/login" replace />} />
    <Route path="/monitoring" element={token ? <MonitoringPage /> : <Navigate to="/login" replace />} />
    <Route path="/dispatch" element={token ? <DispatchPage /> : <Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
