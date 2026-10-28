import React, { useState } from 'react';
import { Loader2, LogIn, Store, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

/**
 * Sign in to CRM with the same email and password as Scaleezy Inventory.
 *
 * The service passes them to Inventory, which decides: CRM keeps no passwords and holds no secret.
 * When one email is used in more than one shop, Inventory asks which -- so this asks too, and signs
 * in again with the one chosen.
 */
export default function SignIn() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shops, setShops] = useState(null);

  const signIn = async (clientId) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password, ...(clientId ? { clientId } : {}) });
      if (res?.requiresWorkspaceSelection) {
        setShops(res.workspaces ?? []);
        return;
      }
      setPassword('');
      await refresh();
    } catch (e) {
      setError(e?.message || 'Signing in is not possible just now. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    signIn();
  };

  return (
    <div className="crm-notice">
      <div className="crm-card si-card">
        <div className="si-brand">
          <img src="/scaleezy-logo.png" alt="Scaleezy" className="logo-on-light" />
          <img src="/scaleezy-logo-dark.png" alt="Scaleezy" className="logo-on-dark" />
          <span className="crm-brand-app">CRM</span>
        </div>

        {shops ? (
          <>
            <h2>Which shop?</h2>
            <p>This email is used in more than one shop. Choose the one to open.</p>
            <div className="si-shops">
              {shops.map(s => (
                <button key={s.clientId} type="button" className="btn-secondary si-shop" disabled={busy} onClick={() => signIn(s.clientId)}>
                  <Store size={16} /> <span>{s.clientId}</span>
                </button>
              ))}
            </div>
            {error && <p className="si-error" role="alert">{error}</p>}
            <button type="button" className="si-link" onClick={() => { setShops(null); setError(''); }}>
              <ArrowLeft size={14} /> Use another email
            </button>
          </>
        ) : (
          <form className="si-form" onSubmit={submit} noValidate>
            <h2>Sign in to CRM</h2>
            <p>Use the same email and password as Scaleezy Inventory.</p>
            <label className="si-label" htmlFor="si-email">Email</label>
            <input id="si-email" className="input-field" type="email" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <label className="si-label" htmlFor="si-password">Password</label>
            <input id="si-password" className="input-field" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="si-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary si-submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
