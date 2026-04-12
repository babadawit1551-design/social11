import { useState } from 'react';
import { apiFetch } from '../lib/api';

interface AggregatedAnalytics {
  postId: string;
  impressions: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  lastRefreshedAt: string | null;
  platformCount: number;
}

interface PlatformMetrics {
  impressions: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  lastRefreshedAt: string | null;
}

interface PlatformAnalytics {
  platformPostId: string;
  platform: string;
  status: string;
  publishedAt: string | null;
  metrics: PlatformMetrics | null;
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

export default function AnalyticsPage() {
  const [postId, setPostId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aggregated, setAggregated] = useState<AggregatedAnalytics | null>(null);
  const [platforms, setPlatforms] = useState<PlatformAnalytics[]>([]);

  async function handleLoad() {
    const id = postId.trim();
    if (!id) { setError('Enter a post ID.'); return; }
    setLoading(true); setError(null); setAggregated(null); setPlatforms([]);
    try {
      const [aggRes, platRes] = await Promise.all([
        apiFetch(`/analytics/posts/${id}`),
        apiFetch(`/analytics/posts/${id}/platforms`),
      ]);
      if (!aggRes.ok) { const e = await aggRes.json().catch(() => ({})); throw new Error(e.error ?? `Failed (${aggRes.status})`); }
      if (!platRes.ok) { const e = await platRes.json().catch(() => ({})); throw new Error(e.error ?? `Failed (${platRes.status})`); }
      const [aggData, platData] = await Promise.all([aggRes.json(), platRes.json()]);
      setAggregated(aggData); setPlatforms(platData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally { setLoading(false); }
  }

  return (
    <div className="page-content">
      <h1>Analytics</h1>
      <div className="card card-mb">
        <legend>Load Analytics</legend>
        <div className="input-row">
          <div className="form-group">
            <label htmlFor="postId" className="form-label">Post ID</label>
            <input id="postId" type="text" value={postId} onChange={e => setPostId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLoad()} placeholder="UUID of the post" className="input" />
          </div>
          <button type="button" onClick={handleLoad} disabled={loading} className="btn btn-primary">
            {loading ? 'Loading…' : 'Load Analytics'}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {aggregated && (
        <div className="card card-mb">
          <legend>Aggregated Metrics</legend>
          <div className="text-muted">
            Post: <code>{aggregated.postId}</code> · Platforms: {aggregated.platformCount} · Last refreshed: {fmtDate(aggregated.lastRefreshedAt)}
          </div>
          <div className="stat-grid">
            {(['Impressions', 'Likes', 'Shares', 'Comments', 'Clicks'] as const).map((label) => {
              const key = label.toLowerCase() as keyof AggregatedAnalytics;
              return (
                <div key={label} className="stat-card">
                  <div className="stat-value">{fmt(aggregated[key] as number)}</div>
                  <div className="stat-label">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {platforms.length > 0 && (
        <div className="card card-mb">
          <legend>Per-Platform Breakdown</legend>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Platform</th>
                  <th className="th">Status</th>
                  <th className="th th-right">Impressions</th>
                  <th className="th th-right">Likes</th>
                  <th className="th th-right">Shares</th>
                  <th className="th th-right">Comments</th>
                  <th className="th th-right">Clicks</th>
                  <th className="th">Last Refreshed</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map(p => (
                  <tr key={p.platformPostId}>
                    <td className="td">{p.platform}</td>
                    <td className="td">{p.status}</td>
                    <td className="td td-right">{fmt(p.metrics?.impressions)}</td>
                    <td className="td td-right">{fmt(p.metrics?.likes)}</td>
                    <td className="td td-right">{fmt(p.metrics?.shares)}</td>
                    <td className="td td-right">{fmt(p.metrics?.comments)}</td>
                    <td className="td td-right">{fmt(p.metrics?.clicks)}</td>
                    <td className="td">{fmtDate(p.metrics?.lastRefreshedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
