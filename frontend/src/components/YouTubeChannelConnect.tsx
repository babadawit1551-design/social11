import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiFetch, getAccessToken } from '../lib/api';

interface Channel {
  id: string;
  channelTitle: string;
  thumbnailUrl?: string;
  quotaUsed: number;
  quotaResetAt: string;
}

interface Props {
  onChannelsChange?: (channels: Channel[]) => void;
}

const QUOTA_LIMIT = 10000;

export default function YouTubeChannelConnect({ onChannelsChange }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [quotaWarning, setQuotaWarning] = useState<{ channelId: string; quotaUsed: number; quotaLimit: number } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadChannels();

    const socket: Socket = io(window.location.origin, {
      auth: { token: getAccessToken() },
      path: '/socket.io',
    });

    socket.on('channel:quota_warning', (payload: { channelId: string; quotaUsed: number; quotaLimit: number }) => {
      setQuotaWarning(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function loadChannels() {
    try {
      const res = await apiFetch('/api/youtube-shorts/channels');
      if (res.ok) {
        const data: Channel[] = await res.json();
        setChannels(data);
        onChannelsChange?.(data);
      }
    } catch {
      // ignore
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      const res = await apiFetch('/api/youtube-shorts/channels/connect', { method: 'POST' });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to get OAuth URL');
      }
    } catch {
      setError('Network error');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(channelId: string) {
    try {
      const res = await apiFetch(`/api/youtube-shorts/channels/${channelId}`, { method: 'DELETE' });
      if (res.ok) {
        const updated = channels.filter(c => c.id !== channelId);
        setChannels(updated);
        onChannelsChange?.(updated);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>YouTube Channels</h2>

      {quotaWarning && (
        <div className="alert-warning" style={{ marginBottom: '1rem' }}>
          ⚠ Quota warning: channel used {quotaWarning.quotaUsed} / {quotaWarning.quotaLimit} units today.
          <button
            style={{ marginLeft: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setQuotaWarning(null)}
          >
            ✕
          </button>
        </div>
      )}

      {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      {channels.length === 0 ? (
        <p className="text-muted">No channels connected.</p>
      ) : (
        <div className="platform-list" style={{ marginBottom: '1rem' }}>
          {channels.map(ch => {
            const pct = Math.round((ch.quotaUsed / QUOTA_LIMIT) * 100);
            return (
              <div key={ch.id} className="platform-card card" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  {ch.thumbnailUrl && (
                    <img src={ch.thumbnailUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  )}
                  <div>
                    <div className="platform-name">{ch.channelTitle}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Quota: {ch.quotaUsed.toLocaleString()} / {QUOTA_LIMIT.toLocaleString()} ({pct}%)
                    </div>
                    <div style={{
                      marginTop: 4,
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--color-border)',
                      width: 160,
                    }}>
                      <div style={{
                        height: '100%',
                        borderRadius: 3,
                        width: `${Math.min(pct, 100)}%`,
                        background: pct >= 90 ? 'var(--color-error)' : 'var(--color-primary)',
                      }} />
                    </div>
                  </div>
                </div>
                <button className="btn btn-danger" onClick={() => handleDisconnect(ch.id)}>
                  Disconnect
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
        {connecting ? 'Redirecting…' : 'Connect YouTube Channel'}
      </button>
    </div>
  );
}
