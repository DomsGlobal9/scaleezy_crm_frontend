import React, { useState } from 'react';
import { Loader2, Store, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import CrmLogo from '../components/CrmLogo';

/**
 * Sign in to CRM with the same email and password as Scaleezy Inventory.
 *
 * The service passes them to Inventory, which decides: CRM keeps no passwords and holds no secret.
 * When one email is used in more than one shop, Inventory asks which -- so this asks too, and signs
 * in again with the one chosen.
 *
 * The page is kept basic (the owner, 28 Oct): the Scaleezy CRM logo and the form, centred, on a
 * laptop and a phone alike. There is no self-service reset, as in Inventory: the shop owner sets
 * passwords in Team members.
 */
export default function SignIn() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="sn-page">
      <main className="sn-side">
        <div className="sn-form-wrap">
          <CrmLogo height={44} className="sn-logo" />
          {shops ? (
            <div className="sn-form">
              <h1>Which shop?</h1>
              <p className="sn-sub">This email is used in more than one shop. Choose the one to open.</p>
              <div className="sn-shops">
                {shops.map(s => (
                  <button key={s.clientId} type="button" className="si-shop" disabled={busy} onClick={() => signIn(s.clientId)}>
                    <span className="sn-shop-icon"><Store size={16} /></span>
                    <span className="si-shop-name">{s.name || s.clientId}{s.name && <small>{s.clientId}</small>}</span>
                  </button>
                ))}
              </div>
              {error && <p className="si-error" role="alert">{error}</p>}
              <button type="button" className="si-link sn-back" onClick={() => { setShops(null); setError(''); }}>
                <ArrowLeft size={14} /> Use another email
              </button>
            </div>
          ) : (
            <form className="sn-form" onSubmit={submit} noValidate>
              <h1>Sign in</h1>
              <p className="sn-sub">Use the same email and password as Scaleezy Inventory.</p>
              <label className="sn-label" htmlFor="si-email">Email</label>
              <input id="si-email" className="input-field sn-input" type="email" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <label className="sn-label" htmlFor="si-password">Password</label>
              <div className="sn-password">
                <input id="si-password" className="input-field sn-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="sn-show" aria-pressed={showPassword} aria-controls="si-password" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {error && <p className="si-error" role="alert">{error}</p>}
              <button type="submit" className="sn-submit" disabled={busy}>
                {busy ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign in'}
              </button>
              {/* No self-service reset, as in Inventory: saying so beats trying passwords until locked out. */}
              <details className="sn-forgot">
                <summary>Forgot your password?</summary>
                <p>Ask your shop owner or manager. They can set a new one for you in Inventory, in <strong>Settings → Team members</strong>.</p>
              </details>
            </form>
          )}
          <p className="sn-one">One sign-in for Inventory and CRM.</p>
        </div>
      </main>
    </div>
  );
}
