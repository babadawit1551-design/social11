import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ComposePage from './pages/ComposePage';
import SchedulePage from './pages/SchedulePage';
import ApprovalPage from './pages/ApprovalPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ConnectionsPage from './pages/ConnectionsPage';
import WebhooksPage from './pages/WebhooksPage';
import AuditLogsPage from './pages/AuditLogsPage';
import YouTubeShortsPage from './pages/YouTubeShortsPage';
import YouTubeShortsJobPage from './pages/YouTubeShortsJobPage';
import Layout from './components/Layout';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/approval" element={<ApprovalPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/youtube-shorts" element={<YouTubeShortsPage />} />
        <Route path="/youtube-shorts/:jobId" element={<YouTubeShortsJobPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
