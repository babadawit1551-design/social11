import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearTokens } from '../lib/api';

const routes = [
  { to: '/', label: 'Dashboard' },
  { to: '/compose', label: 'Compose' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/approval', label: 'Approval' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/connections', label: 'Connections' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/audit-logs', label: 'Audit Logs' },
  { to: '/youtube-shorts', label: 'YouTube Shorts' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setTheme('dark');
    }
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function handleLogout() {
    clearTokens();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {routes.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
      </button>
      <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
    </aside>
  );
}
