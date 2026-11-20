import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { useAuthStore } from '../stores/authStore';
export default function App() {
  const token = useAuthStore((s) => s.token);
  return <Routes><Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} /><Route path="/" element={token ? <DashboardPage /> : <Navigate to="/login" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
