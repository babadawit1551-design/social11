import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import YouTubeChannelConnect from '../components/YouTubeChannelConnect';

interface Channel {
  id: string;
  channelTitle: string;
  quotaUsed: number;
}

interface VideoJob {
  id: string;
  youtubeUrl: string;
  status: string;
  maxClips: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#856404',
  processing: '#0066cc',
  completed: '#155724',
  failed: '#721c24',
  cancelled: '#6b7280',
};

export default function YouTubeShortsPage() {
  const [url, setUrl] = useState('');
  const [maxClips, setMaxClips] = useState(5);
  const [minDuration, setMinDuration] = useState(30);
  const [maxDuration, setMaxDuration] = useState(60);
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadChannels();
    loadJobs();
  }, []);

  async function loadChannels() {
    try {
      const res = await apiFetch('/api/youtube-shorts/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch {
      // ignore
    }
  }

  async function loadJobs() {
    try {
      const res = await apiFetch('/api/youtube-shorts/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? data);
      }
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        youtubeUrl: url,
        maxClips,
        minClipDuration: minDuration,
        maxClipDuration: maxDuration,
        burnCaptions,
      };
      if (channelId) body.channelId = channelId;

      const res = await apiFetch('/api/youtube-shorts/jobs', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Submission failed');
      } else {
        setSuccess(`Job created: ${data.id}`);
        setUrl('');
        loadJobs();
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-content">
      <h1>YouTube Shorts</h1>

      <YouTubeChannelConnect onChannelsChange={setChannels} />

      <div className="card card-mb" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Submit Video</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">YouTube URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Max Clips (1–10)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                value={maxClips}
                onChange={e => setMaxClips(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Channel</label>
              <select
                className="select"
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
              >
                <option value="">— none —</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.channelTitle}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Min Duration (s)</label>
              <input
                className="input"
                type="number"
                min={15}
                max={60}
                value={minDuration}
                onChange={e => setMinDuration(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max Duration (s)</label>
              <input
                className="input"
                type="number"
                min={30}
                max={180}
                value={maxDuration}
                onChange={e => setMaxDuration(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={burnCaptions}
                onChange={e => setBurnCaptions(e.target.checked)}
              />
              Burn captions into video
            </label>
          </div>

          {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
          {success && <div className="alert-success" style={{ marginBottom: '0.75rem' }}>{success}</div>}

          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Job'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-muted">No jobs yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="th">URL</th>
                <th className="th">Status</th>
                <th className="th">Clips</th>
                <th className="th">Created</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td className="td" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.youtubeUrl}
                  </td>
                  <td className="td">
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: STATUS_COLORS[job.status] ?? '#6b7280',
                      background: 'var(--color-bg)',
                    }}>
                      {job.status}
                    </span>
                  </td>
                  <td className="td">{job.maxClips}</td>
                  <td className="td">{new Date(job.createdAt).toLocaleString()}</td>
                  <td className="td">
                    <Link to={`/youtube-shorts/${job.id}`} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '2px 10px' }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
