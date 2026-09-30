import { useState } from 'react';
import { useAdmin } from '../store';
import { Icon } from '../ui';

export default function Login() {
  const connect = useAdmin((s) => s.connect);
  const error = useAdmin((s) => s.authError);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await connect(pw);
          setBusy(false);
        }}
      >
        <div className="brand">
          <span className="brand-dot" />
          <span>
            Alive <em>CRM</em>
          </span>
        </div>
        <p className="muted small">Visitor data includes IP addresses and locations. Sign in with the admin password.</p>
        <label className="login-field">
          <Icon name="lock" />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error && <p className="login-error small">{error}</p>}
        <button className="btn primary" disabled={!pw || busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
