import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

const EVENT_TYPES = [
  'post.published',
  'post.failed',
  'post.approved',
  'post.rejected',
  'platform_connection.expired',
] as const;

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  consecutiveFailures: number;
  createdAt: string;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function loadWebhooks() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/webhooks');
      if (!res.ok) throw new Error(`Failed to load webhooks (${res.status})`);
      setWebhooks(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadWebhooks(); }, []);

  function toggleEvent(type: string) {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterError(null); setNewSecret(null);
    if (!url.trim()) { setRegisterError('URL is required'); return; }
    if (selectedEvents.size === 0) { setRegisterError('Select at least one event type'); return; }
    setRegistering(true);
    try {
      const res = await apiFetch('/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), eventTypes: Array.from(selectedEvents) }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Failed (${res.status})`); }
      const created = await res.json();
      setNewSecret(created.secret);
      setUrl(''); setSelectedEvents(new Set());
      await loadWebhooks();
    } catch (e: unknown) {
      setRegisterError(e instanceof Error ? e.message : 'Registration failed');
    } finally { setRegistering(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this webhook?')) return;
    try {
      const res = await apiFetch(`/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);
      setWebhooks(prev => prev.filter(w => w.id !== id));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }

  return (
    <div className="page-content">
      <h1>Webhooks</h1>
      <p className="text-muted">Register endpoints to receive real-time event notifications.</p>

      <section className="card card-mb">
        <h2>Register Webhook</h2>
        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">URL</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="input" />
          </div>
          <div className="form-group">
            <div className="form-label">Event Types</div>
            <div className="event-types-list">
              {EVENT_TYPES.map(type => (
                <label key={type} className="event-type-row">
                  <input type="checkbox" checked={selectedEvents.has(type)} onChange={() => toggleEvent(type)} />
                  <code>{type}</code>
                </label>
              ))}
            </div>
          </div>
          {registerError && <div className="alert-error">{registerError}</div>}
          <button type="submit" disabled={registering} className="btn btn-primary">
            {registering ? 'Registering…' : 'Register'}
          </button>
        </form>
        {newSecret && (
          <div className="secret-box">
            <div className="secret-title">⚠ Save this secret — it won't be shown again</div>
            <code className="secret-code">{newSecret}</code>
          </div>
        )}
      </section>

      <section className="webhooks-section">
        <h2>Registered Webhooks</h2>
        {loading && <p className="text-muted">Loading…</p>}
        {error && <div className="alert-error">{error}</div>}
        {!loading && !error && webhooks.length === 0 && <p className="text-muted">No webhooks registered yet.</p>}
        {!loading && webhooks.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">URL</th>
                  <th className="th">Event Types</th>
                  <th className="th">Enabled</th>
                  <th className="th">Failures</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(w => (
                  <tr key={w.id}>
                    <td className="td"><span className="word-break">{w.url}</span></td>
                    <td className="td"><div className="event-tags">{w.eventTypes.map(t => <code key={t}>{t}</code>)}</div></td>
                    <td className="td"><span className={w.enabled ? 'status-enabled' : 'status-disabled'}>{w.enabled ? 'Yes' : 'No'}</span></td>
                    <td className="td">{w.consecutiveFailures}</td>
                    <td className="td">
                      <button type="button" onClick={() => handleDelete(w.id)} className="btn btn-danger">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
