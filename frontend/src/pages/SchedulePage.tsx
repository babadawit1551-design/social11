import { useState } from 'react';
import { apiFetch } from '../lib/api';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

interface Schedule {
  id: string;
  postId: string;
  scheduledAt: string;
  timezone: string;
  status: string;
  createdAt: string;
}

export default function SchedulePage() {
  const [postId, setPostId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [scheduleId, setScheduleId] = useState('');
  const [lookupPostId, setLookupPostId] = useState('');
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function showStatus(type: 'success' | 'error', message: string) {
    setStatus({ type, message });
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!postId.trim() || !scheduledAt) {
      showStatus('error', 'Post ID and date/time are required.');
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const isoString = new Date(scheduledAt).toISOString();
      const res = await apiFetch('/schedules', {
        method: 'POST',
        body: JSON.stringify({ postId: postId.trim(), scheduledAt: isoString, timezone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const data: Schedule = await res.json();
      showStatus('success', `Schedule created — ID: ${data.id}`);
      setPostId('');
      setScheduledAt('');
      setTimezone('UTC');
    } catch (err: unknown) {
      showStatus('error', err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    if (!lookupPostId.trim()) {
      showStatus('error', 'Enter a post ID to look up.');
      return;
    }
    setLoading(true);
    setStatus(null);
    setSchedule(null);
    try {
      const res = await apiFetch(`/schedules/${lookupPostId.trim()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Not found (${res.status})`);
      }
      const data: Schedule = await res.json();
      setSchedule(data);
    } catch (err: unknown) {
      showStatus('error', err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!scheduleId.trim()) {
      showStatus('error', 'Enter a schedule ID to cancel.');
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const res = await apiFetch(`/schedules/${scheduleId.trim()}`, { method: 'DELETE' });
      if (res.status !== 204 && !res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      showStatus('success', 'Schedule cancelled.');
      setScheduleId('');
      if (schedule?.id === scheduleId.trim()) setSchedule(null);
    } catch (err: unknown) {
      showStatus('error', err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Schedule Post</h1>

      {/* Create schedule */}
      <form onSubmit={handleSchedule} className="form-group">
        <div className="card card-mb">
          <legend>Create Schedule</legend>

          <div className="form-group">
            <label htmlFor="postId" className="form-label">Post ID</label>
            <input
              id="postId"
              type="text"
              className="input"
              value={postId}
              onChange={e => setPostId(e.target.value)}
              placeholder="UUID of the post to schedule"
            />
          </div>

          <div className="form-group">
            <label htmlFor="scheduledAt" className="form-label">Date &amp; Time</label>
            <input
              id="scheduledAt"
              type="datetime-local"
              className="input"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="timezone" className="form-label">Timezone</label>
            <select
              id="timezone"
              className="select"
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Scheduling…' : 'Schedule Post'}
          </button>
        </div>
      </form>

      {/* Look up schedule */}
      <div className="card card-mb">
        <legend>Look Up Schedule</legend>
        <div className="input-row">
          <div className="form-group">
            <label htmlFor="lookupPostId" className="form-label">Post ID</label>
            <input
              id="lookupPostId"
              type="text"
              className="input"
              value={lookupPostId}
              onChange={e => setLookupPostId(e.target.value)}
              placeholder="UUID of the post"
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleLookup}
            disabled={loading}
          >
            Look up schedule
          </button>
        </div>

        {schedule && (
          <div className="schedule-result">
            <div><strong>Schedule ID:</strong> {schedule.id}</div>
            <div><strong>Post ID:</strong> {schedule.postId}</div>
            <div><strong>Scheduled At:</strong> {new Date(schedule.scheduledAt).toLocaleString()}</div>
            <div><strong>Timezone:</strong> {schedule.timezone}</div>
            <div><strong>Status:</strong> {schedule.status}</div>
            <div><strong>Created:</strong> {new Date(schedule.createdAt).toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Cancel schedule */}
      <div className="card card-mb">
        <legend>Cancel Schedule</legend>
        <div className="input-row">
          <div className="form-group">
            <label htmlFor="scheduleId" className="form-label">Schedule ID</label>
            <input
              id="scheduleId"
              type="text"
              className="input"
              value={scheduleId}
              onChange={e => setScheduleId(e.target.value)}
              placeholder="UUID of the schedule"
            />
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel schedule
          </button>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className={status.type === 'success' ? 'alert-success' : 'alert-error'}>
          {status.message}
        </div>
      )}
    </div>
  );
}
