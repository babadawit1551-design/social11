import { useState, useRef } from 'react';
import { apiFetch } from '../lib/api';

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter', limit: 280 },
  { id: 'linkedin', label: 'LinkedIn', limit: 3000 },
  { id: 'facebook', label: 'Facebook', limit: 63206 },
  { id: 'instagram', label: 'Instagram', limit: 2200 },
] as const;

type PlatformId = (typeof PLATFORMS)[number]['id'];

const AI_MODELS = ['gpt-4', 'claude', 'llama'] as const;
const ACCEPTED_MEDIA = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime';

export default function ComposePage() {
  const [body, setBody] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformId>>(new Set());
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [mediaNames, setMediaNames] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [model, setModel] = useState<string>('gpt-4');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function togglePlatform(id: PlatformId) {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/media/upload', {
        method: 'POST',
        body: form,
        headers: {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setMediaIds(prev => [...prev, data.id]);
      setMediaNames(prev => [...prev, file.name]);
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      setStatus({ type: 'error', message: 'Enter a topic before generating.' });
      return;
    }
    setGenerating(true);
    setStatus(null);
    try {
      const platform = selectedPlatforms.size === 1 ? [...selectedPlatforms][0] : 'twitter';
      const res = await apiFetch('/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ topic, platform, model }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Generation failed (${res.status})`);
      }
      const data = await res.json();
      setBody(data.body ?? '');
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setStatus({ type: 'error', message: 'Post body is required.' });
      return;
    }
    if (selectedPlatforms.size === 0) {
      setStatus({ type: 'error', message: 'Select at least one platform.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = {
        body,
        targetPlatforms: [...selectedPlatforms],
      };
      if (mediaIds.length > 0) payload.mediaIds = mediaIds;
      const res = await apiFetch('/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Submit failed (${res.status})`);
      }
      setStatus({ type: 'success', message: 'Post created successfully.' });
      setBody('');
      setSelectedPlatforms(new Set());
      setMediaIds([]);
      setMediaNames([]);
      setTopic('');
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="compose-page">
      <h1>Compose Post</h1>

      <form onSubmit={handleSubmit}>
        {/* Body */}
        <div className="form-group">
          <label htmlFor="body" className="form-label">Post Body</label>
          <textarea
            id="body"
            className="textarea"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
          />
        </div>

        {/* Platform checkboxes + character counts */}
        <div className="card form-group">
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend className="form-label">Platforms</legend>
            {PLATFORMS.map(({ id, label, limit }) => {
              const count = body.length;
              const over = count > limit;
              return (
                <div key={id} className="platform-row">
                  <input
                    type="checkbox"
                    id={`platform-${id}`}
                    checked={selectedPlatforms.has(id)}
                    onChange={() => togglePlatform(id)}
                  />
                  <label htmlFor={`platform-${id}`}>{label}</label>
                  {/* Exception per Requirements 6.1: dynamic color cannot be expressed as static CSS */}
                  <span className="char-count" style={{ color: over ? 'red' : 'inherit' }}>
                    {count}/{limit}
                  </span>
                </div>
              );
            })}
          </fieldset>
        </div>

        {/* Media upload */}
        <div className="form-group">
          <span className="form-label">Media</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MEDIA}
            onChange={handleMediaUpload}
            style={{ display: 'none' }}
            id="media-upload"
          />
          <label
            htmlFor="media-upload"
            className={`media-upload-label${uploading ? ' uploading' : ''}`}
          >
            {uploading ? 'Uploading…' : 'Upload Media'}
          </label>
          {mediaNames.length > 0 && (
            <ul className="media-list">
              {mediaNames.map((name, i) => <li key={i}>{name}</li>)}
            </ul>
          )}
        </div>

        {/* AI Generate */}
        <div className="card form-group">
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend className="form-label">AI Generate</legend>
            <div className="ai-generate-row">
              <input
                type="text"
                className="input"
                placeholder="Topic"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              />
              <select
                className="select"
                value={model}
                onChange={e => setModel(e.target.value)}
              >
                {AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button
                type="button"
                className="btn"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </fieldset>
        </div>

        {/* Status message */}
        {status && (
          <div className={`form-group ${status.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {status.message}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  );
}
