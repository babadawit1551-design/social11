import { useState } from 'react';
import { apiFetch } from '../lib/api';

interface Post {
  id: string;
  body: string;
  status: string;
  targetPlatforms: string[];
  createdAt: string;
  updatedAt: string;
}

export default function ApprovalPage() {
  const [postId, setPostId] = useState('');
  const [post, setPost] = useState<Post | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function showMsg(type: 'success' | 'error', text: string) {
    setMsg({ type, text });
  }

  async function handleLoad() {
    if (!postId.trim()) {
      showMsg('error', 'Enter a post ID.');
      return;
    }
    setLoading(true);
    setMsg(null);
    setPost(null);
    try {
      const res = await apiFetch(`/posts/${postId.trim()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const data: Post = await res.json();
      setPost(data);
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: 'submit-approval' | 'approve' | 'reject') {
    if (!post) return;
    if (action === 'reject' && !rejectionReason.trim()) {
      showMsg('error', 'Rejection reason is required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const body = action === 'reject' ? JSON.stringify({ reason: rejectionReason.trim() }) : undefined;
      const res = await apiFetch(`/posts/${post.id}/${action}`, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const updated: Post = await res.json();
      setPost(updated);
      const labels: Record<string, string> = {
        'submit-approval': 'Submitted for approval.',
        approve: 'Post approved.',
        reject: 'Post rejected.',
      };
      showMsg('success', labels[action]);
      if (action === 'reject') setRejectionReason('');
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Approval Workflow</h1>

      {/* Load post */}
      <div className="card card-mb">
        <legend>Load Post</legend>
        <div className="input-row">
          <div className="form-group">
            <label htmlFor="postId" className="form-label">Post ID</label>
            <input
              id="postId"
              type="text"
              value={postId}
              onChange={e => setPostId(e.target.value)}
              placeholder="UUID of the post"
              className="input"
            />
          </div>
          <button type="button" onClick={handleLoad} disabled={loading} className="btn">
            Load Post
          </button>
        </div>

        {post && (
          <div className="schedule-result">
            <div><strong>ID:</strong> {post.id}</div>
            <div><strong>Status:</strong> <strong>{post.status}</strong></div>
            <div><strong>Platforms:</strong> {post.targetPlatforms?.join(', ')}</div>
            <div><strong>Body:</strong></div>
            <div className="post-body">{post.body}</div>
          </div>
        )}
      </div>

      {/* Submit for approval */}
      <div className="card card-mb">
        <legend>Submit for Approval</legend>
        <p className="text-muted">
          Transitions the loaded post from <em>draft</em> to <em>pending_approval</em>.
        </p>
        <button
          type="button"
          onClick={() => handleAction('submit-approval')}
          disabled={loading || !post}
          className="btn btn-primary"
        >
          Submit for Approval
        </button>
      </div>

      {/* Admin section */}
      <div className="card card-mb">
        <legend>Admin Actions</legend>
        <p className="text-muted">
          These actions require Admin role.
        </p>

        <button
          type="button"
          onClick={() => handleAction('approve')}
          disabled={loading || !post}
          className="btn btn-success"
        >
          Approve
        </button>

        <div className="form-group">
          <label htmlFor="rejectionReason" className="form-label">
            Rejection Reason
          </label>
          <textarea
            id="rejectionReason"
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="Explain why the post is being rejected…"
            rows={3}
            className="textarea"
          />
          <button
            type="button"
            onClick={() => handleAction('reject')}
            disabled={loading || !post}
            className="btn btn-danger btn-mt"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Status message */}
      {msg && (
        <div className={msg.type === 'success' ? 'alert-success' : 'alert-error'}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
