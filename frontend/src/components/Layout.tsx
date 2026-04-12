import { Navigate, Outlet } from 'react-router-dom';
import { getAccessToken } from '../lib/api';
import Sidebar from './Sidebar';

export default function Layout() {
  const token = getAccessToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
