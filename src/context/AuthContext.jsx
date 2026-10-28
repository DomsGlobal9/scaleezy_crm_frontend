import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

/**
 * Who is signed in, asked of the CRM service, which reads the cookie Inventory set.
 *
 * `status` is one of: 'checking' (first load), 'in' (a person), 'unavailable' (the sign-in could
 * not be checked just now -- Inventory did not answer; NOT the same as signed out), 'out' (nobody, or the sign-in
 * ended). There is no login here -- see components/SignInNeeded.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('checking');

  const checkSession = useCallback(async () => {
    try {
      const res = await api.get('/auth/session');
      if (res?.authenticated && res.user) {
        setUser({ ...res.user, clientId: res.user.clientId ?? res.client?.id ?? null });
        setStatus('in');
      } else {
        setUser(null);
        setStatus('out');
      }
    } catch (error) {
      setUser(null);
      // 503: CRM could not ask Inventory who this is. Saying "sign in" would be untrue and would not help.
      setStatus(error?.statusCode === 503 || error?.statusCode === 0 ? 'unavailable' : 'out');
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  // A 401 from any request means the sign-in ended while the page was open.
  useEffect(() => {
    const out = () => { setUser(null); setStatus('out'); };
    window.addEventListener('scaleezy:signed-out', out);
    return () => window.removeEventListener('scaleezy:signed-out', out);
  }, []);

  const value = {
    user,
    status,
    clientId: user?.clientId || null,
    permissions: user?.permissions || [],
    roles: user?.roles || [],
    refresh: checkSession
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
