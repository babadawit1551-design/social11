import { Link } from 'react-router-dom';

const NAV_CARDS = [
  { to: '/compose', label: 'Compose' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/approval', label: 'Approval' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/connections', label: 'Connections' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/audit-logs', label: 'Audit Logs' },
  { to: '/youtube-shorts', label: 'YouTube Shorts' },
];

export default function HomePage() {
  return (
    <div className="page-content">
      <h1>Welcome to SMAS</h1>
      <div className="card-grid">
        {NAV_CARDS.map(({ to, label }) => (
          <Link key={to} to={to} className="card card-link">
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
