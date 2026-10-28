import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { useMerges, useTodayCount } from '../hooks/useWork';

const THEME_KEY = 'scale_easy_theme'; // Inventory's key, so the two apps share one setting

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

/**
 * The top bar every CRM screen sits under: the brand, the three places (Today, Customers,
 * Duplicates -- the last only for those who may merge), who is signed in, light or dark, sign out.
 * On a phone the places drop to a row of their own so nothing is squeezed.
 */
export default function AppShell() {
  const { user, signOut } = useAuth();
  const { can } = usePermission();
  const [theme, setTheme] = useState(readTheme);
  const seesCustomers = can('customer:view');
  const mayMerge = can('crm:customer:merge');
  const due = useTodayCount(seesCustomers);
  const merges = useMerges('open', mayMerge);
  const dueCount = due.data?.mine ?? 0;
  const openPairs = merges.data?.open ?? 0;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* fine */ }
  }, [theme]);

  return (
    <div className="crm-shell">
      <header className="crm-topbar">
        <a className="crm-brand" href="/today" aria-label="Scaleezy CRM">
          <img src="/scaleezy-logo.png" alt="Scaleezy" className="logo-on-light" />
          <img src="/scaleezy-logo-dark.png" alt="Scaleezy" className="logo-on-dark" />
          <span className="crm-brand-app">CRM</span>
        </a>
        {seesCustomers && (
          <nav className="crm-nav" aria-label="CRM">
            <NavLink to="/today" className={({ isActive }) => `crm-tab${isActive ? ' on' : ''}`}>
              Today{dueCount > 0 && <span className="crm-badge" aria-label={`${dueCount} due`}>{dueCount > 99 ? '99+' : dueCount}</span>}
            </NavLink>
            <NavLink to="/customers" className={({ isActive }) => `crm-tab${isActive ? ' on' : ''}`}>Customers</NavLink>
            {mayMerge && (
              <NavLink to="/duplicates" className={({ isActive }) => `crm-tab${isActive ? ' on' : ''}`}>
                Duplicates{openPairs > 0 && <span className="crm-badge quiet" aria-label={`${openPairs} to review`}>{openPairs}</span>}
              </NavLink>
            )}
          </nav>
        )}
        <div className="crm-topbar-right">
          {user?.name && <span className="crm-user" title={user.email}>{user.name}</span>}
          <button type="button" className="crm-iconbtn" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} title={theme === 'dark' ? 'Light' : 'Dark'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="crm-iconbtn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
