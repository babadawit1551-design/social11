import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, storeTokens } from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Login failed');
        return;
      }
      const data = await res.json() as { access_token: string; refresh_token: string };
      storeTokens(data.access_token, data.refresh_token);
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label><br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password">Password</label><br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="input"
          />
        </div>
        {error && <p className="alert-error">{error}</p>}
        <button type="submit" disabled={loading} className="btn btn-primary btn-block">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
