import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

interface AuditLog {
  id: string;
  userId: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [actionType, setActionType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function fetchLogs() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (userId.trim()) params.set('user_id', userId.trim());
      if (resourceType.trim()) params.set('resource_type', resourceType.trim());
      if (actionType.trim()) params.set('action_type', actionType.trim());
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      const qs = params.toString();
      const res = await apiFetch(`/audit-logs${qs ? `?${qs}` : ''}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? `Failed (${res.status})`); }
      setLogs(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchLogs(); }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs();
  }

  return (
    <div className="page-content">
      <h1>Audit Logs</h1>
      <p className="alert-warning">
        Admin access required. Only users with the Admin role can view audit logs.
      </p>

      <form onSubmit={handleSearch} className="filter-form">
        <div className="form-group">
          <label className="form-label">User ID</label>
          <input type="text" value={userId} onChange={e => setUserId(e.target.value)} placeholder="UUID" className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Resource Type</label>
          <input type="text" value={resourceType} onChange={e => setResourceType(e.target.value)} placeholder="e.g. post" className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Action Type</label>
          <input type="text" value={actionType} onChange={e => setActionType(e.target.value)} placeholder="e.g. create" className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">From</label>
          <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">To</label>
          <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className="input" />
        </div>
        <div className="form-group">
          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="alert-error">{error}</div>}

      {!loading && !error && logs.length === 0 && <p className="text-muted">No audit log entries found.</p>}

      {logs.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Timestamp</th>
                <th className="th">User ID</th>
                <th className="th">Action</th>
                <th className="th">Resource Type</th>
                <th className="th">Resource ID</th>
                <th className="th">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="td">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="td td-mono">{log.userId}</td>
                  <td className="td">{log.actionType}</td>
                  <td className="td">{log.resourceType}</td>
                  <td className="td td-mono">{log.resourceId}</td>
                  <td className="td">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
