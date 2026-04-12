import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { apiFetch, getAccessToken } from '../lib/api';
import ClipEditor from '../components/ClipEditor';

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

interface Job {
  id: string;
  youtubeUrl: string;
  status: string;
  maxClips: number;
  createdAt: string;
  clips: Clip[];
}

interface Progress {
  status: string;
  stage: string;
  percentage: number;
}

export default function YouTubeShortsJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!jobId) return;
    loadJob();

    const socket: Socket = io(window.location.origin, {
      auth: { token: getAccessToken() },
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('job:progress', (payload: { jobId: string; status: string; stage: string; percentage: number }) => {
      if (payload.jobId !== jobId) return;
      setProgress({ status: payload.status, stage: payload.stage, percentage: payload.percentage });
    });

    socket.on('job:clip_ready', (payload: { jobId: string; clipId: string; thumbnailUrl: string; viralScore: number }) => {
      if (payload.jobId !== jobId) return;
      // Reload to get full clip data
      loadJob();
    });

    socket.on('job:completed', (payload: { jobId: string; clipIds: string[] }) => {
      if (payload.jobId !== jobId) return;
      setProgress(p => p ? { ...p, status: 'completed', percentage: 100 } : { status: 'completed', stage: 'done', percentage: 100 });
      loadJob();
    });

    socket.on('job:failed', (payload: { jobId: string; error: string }) => {
      if (payload.jobId !== jobId) return;
      setError(payload.error);
      setProgress(p => p ? { ...p, status: 'failed' } : { status: 'failed', stage: 'failed', percentage: 0 });
    });

    return () => {
      socket.disconnect();
    };
  }, [jobId]);

  async function loadJob() {
    if (!jobId) return;
    try {
      const res = await apiFetch(`/api/youtube-shorts/jobs/${jobId}`);
      if (res.ok) {
        const data: Job = await res.json();
        setJob(data);
        setClips(data.clips ?? []);
      } else {
        setError('Job not found');
      }
    } catch {
      setError('Failed to load job');
    }
  }

  function handleClipUpdated(updated: Clip) {
    setClips(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  if (error) {
    return (
      <div className="page-content">
        <Link to="/youtube-shorts" className="btn" style={{ marginBottom: '1rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
          ← Back
        </Link>
        <div className="alert-error">{error}</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-content">
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const isActive = job.status === 'pending' || job.status === 'processing';

  return (
    <div className="page-content">
      <Link to="/youtube-shorts" className="btn" style={{ marginBottom: '1rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
        ← Back
      </Link>

      <div className="card card-mb">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem' }}>Job Details</h2>
            <div className="text-muted" style={{ wordBreak: 'break-all' }}>{job.youtubeUrl}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Created {new Date(job.createdAt).toLocaleString()}
            </div>
          </div>
          <span style={{
            padding: '4px 12px',
            borderRadius: 4,
            fontWeight: 600,
            fontSize: '0.875rem',
            background: 'var(--color-bg)',
            color: job.status === 'completed' ? 'var(--color-success)' : job.status === 'failed' ? 'var(--color-error)' : 'var(--color-primary)',
          }}>
            {job.status}
          </span>
        </div>

        {isActive && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 4 }}>
              <span>{progress?.stage ?? 'Waiting…'}</span>
              <span>{progress?.percentage ?? 0}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--color-border)' }}>
              <div style={{
                height: '100%',
                borderRadius: 4,
                width: `${progress?.percentage ?? 0}%`,
                background: 'var(--color-primary)',
                transition: 'width 0.4s',
              }} />
            </div>
          </div>
        )}
      </div>

      {clips.length > 0 && (
        <div>
          <h2>Clips ({clips.length})</h2>
          {clips.map(clip => (
            <ClipEditor
              key={clip.id}
              clip={clip}
              socket={socketRef.current}
              onUpdated={handleClipUpdated}
            />
          ))}
        </div>
      )}

      {job.status === 'completed' && clips.length === 0 && (
        <p className="text-muted">No clips were generated.</p>
      )}
    </div>
  );
}
