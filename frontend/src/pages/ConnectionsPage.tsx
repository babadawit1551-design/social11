import { useEffect, useState } from 'react';

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter / X', color: '#1da1f2', description: 'Connect your X/Twitter account to publish tweets.' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0077b5', description: 'Connect a LinkedIn Company Page to publish posts.' },
  { id: 'facebook', label: 'Facebook', color: '#1877f2', description: 'Connect a Facebook Page to publish posts.' },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', description: 'Connect an Instagram Business account to publish posts.' },
] as const;

export default function ConnectionsPage() {
  const [connected, setConnected] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get('connected');
    if (platform) {
      setConnected(platform);
    }
  }, []);

  function handleConnect(platform: string) {
    window.location.href = `/auth/oauth/${platform}/start`;
  }

  return (
    <div className="page-content">
      <h1>Platform Connections</h1>
      <p className="text-muted">
        Connect your social media accounts. You will be redirected to each platform to authorize access.
      </p>

      {connected && (
        <div className="alert-success card-mb">
          Successfully connected <strong>{connected}</strong>. You can now publish to this platform.
        </div>
      )}

      <div className="platform-list">
        {PLATFORMS.map(p => (
          <div key={p.id} className="card platform-card">
            <div>
              <div className="platform-name">{p.label}</div>
              <div className="text-muted">{p.description}</div>
            </div>
            {/* Exception per Requirements 6.1: per-platform brand color cannot be expressed as static CSS */}
            <button
              type="button"
              className="btn"
              style={{ background: p.color, color: '#fff' }}
              onClick={() => handleConnect(p.id)}
            >
              Connect
            </button>
          </div>
        ))}
      </div>

      <p className="text-muted">
        Note: Clicking Connect will redirect you to the platform's authorization page. After authorizing, you will be returned here.
      </p>
    </div>
  );
}
