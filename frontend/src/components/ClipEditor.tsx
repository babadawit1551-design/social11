import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { apiFetch } from '../lib/api';

interface Clip {
  id: string;
  title: string;
  description: string;
  viralScore: number;
  thumbnailUrl?: string;
  startSeconds: number;
  endSeconds: number;
  status: string;
  youtubeUrl?: string;
}

interface Props {
  clip: Clip;
  socket: Socket | null;
  onUpdated?: (clip: Clip) => void;
}

export default function ClipEditor({ clip, socket, onUpdated }: Props) {
  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState(clip.description);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ bytes: number; total: number } | null>(null);
  const [uploadDone, setUploadDone] = useState(!!clip.youtubeUrl);
  const [youtubeUrl, setYoutubeUrl] = useState(clip.youtubeUrl ?? '');

  const duration = clip.endSeconds - clip.startSeconds;

  useEffect(() => {
    if (!socket) return;

    function onUploadProgress(payload: { clipId: string; bytesUploaded: number; totalBytes: number }) {
      if (payload.clipId !== clip.id) return;
      setUploadProgress({ bytes: payload.bytesUploaded, total: payload.totalBytes });
    }

    function onUploaded(payload: { clipId: string; youtubeVideoId: string; youtubeUrl: string }) {
      if (payload.clipId !== clip.id) return;
      setUploading(false);
      setUploadDone(true);
      setYoutubeUrl(payload.youtubeUrl);
      setUploadProgress(null);
    }

    socket.on('clip:upload_progress', onUploadProgress);
    socket.on('clip:uploaded', onUploaded);

    return () => {
      socket.off('clip:upload_progress', onUploadProgress);
      socket.off('clip:uploaded', onUploaded);
    };
  }, [socket, clip.id]);

  async function handleSave() {
    setSaveError('');
    if (title.length > 100) { setSaveError('Title must be ≤ 100 characters'); return; }
    if (description.length > 5000) { setSaveError('Description must be ≤ 5000 characters'); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/youtube-shorts/clips/${clip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated?.(updated);
      } else {
        const data = await res.json();
        setSaveError(data.error ?? 'Save failed');
      }
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    try {
      const res = await apiFetch(`/api/youtube-shorts/clips/${clip.id}/download`);
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, '_blank');
      }
    } catch {
      // ignore
    }
  }

  async function handleUpload() {
    setUploading(true);
    setUploadProgress(null);
    try {
      const res = await apiFetch(`/api/youtube-shorts/clips/${clip.id}/upload`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? 'Upload failed');
        setUploading(false);
      }
    } catch {
      setSaveError('Network error');
      setUploading(false);
    }
  }

  async function handleRegenerate() {
    try {
      await apiFetch(`/api/youtube-shorts/clips/${clip.id}/regenerate`, { method: 'POST' });
    } catch {
      // ignore
    }
  }

  const uploadPct = uploadProgress && uploadProgress.total > 0
    ? Math.round((uploadProgress.bytes / uploadProgress.total) * 100)
    : 0;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {clip.thumbnailUrl && (
          <img
            src={clip.thumbnailUrl}
            alt="thumbnail"
            style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {duration.toFixed(1)}s · Viral score: {(clip.viralScore * 100).toFixed(0)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{clip.status}</span>
          </div>

          <div className="form-group">
            <label className="form-label">
              Title <span className="char-count" style={{ color: title.length > 100 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                {title.length}/100
              </span>
            </label>
            <input
              className="input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={110}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Description <span className="char-count" style={{ color: description.length > 5000 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                {description.length}/5000
              </span>
            </label>
            <textarea
              className="textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {saveError && <div className="alert-error" style={{ marginBottom: '0.5rem' }}>{saveError}</div>}

          {uploading && uploadProgress && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', marginBottom: 4 }}>Uploading… {uploadPct}%</div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${uploadPct}%`, background: 'var(--color-primary)', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {uploadDone && youtubeUrl && (
            <div className="alert-success" style={{ marginBottom: '0.5rem' }}>
              Uploaded: <a href={youtubeUrl} target="_blank" rel="noreferrer">{youtubeUrl}</a>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} onClick={handleDownload}>
              Download
            </button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || uploadDone}>
              {uploading ? 'Uploading…' : uploadDone ? 'Uploaded' : 'Upload to YouTube'}
            </button>
            <button className="btn" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} onClick={handleRegenerate}>
              Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
